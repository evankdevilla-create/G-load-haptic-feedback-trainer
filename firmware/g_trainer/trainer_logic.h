// trainer_logic.h - the cuff control logic, with no Arduino-specific code.
//
// Kept separate from g_trainer.ino so it can be unit-tested on a laptop
// (see firmware/test/). The .ino file only reads serial, feeds lines in here,
// calls update() every loop, and copies pump()/valveClosed() to the relays.
//
// Hardware assumption (corrected 2026-10-11): the vent solenoid is NORMALLY CLOSED
// and is wired through its relay's NC contact, so at the RELAY level:
//   valve relay off = NC contact closed = valve powered   = open   = cuff vents (fail-safe)
//   valve relay on  = contact open      = valve unpowered = closed = cuff holds / can inflate
// valveClosed() below means "valve relay on". So "everything off" is still the safe
// state, as long as the valve's own battery pack is connected and charged.

#pragma once

#include <stdlib.h>
#include <string.h>

// Pump-on time over a rolling window: 25 buckets of 5 s (covers 120 to 125 s), no heap.
// Rollover safe: only differences of millis() are used.
class PumpWindow {
 public:
  void add(unsigned long now, unsigned long ms) { advance(now); used[cur] += ms; }

  unsigned long total(unsigned long now) {
    advance(now);
    unsigned long sum = 0;
    for (unsigned char i = 0; i < N; i++) sum += used[i];
    return sum;
  }

 private:
  static const unsigned char N = 25;
  static const unsigned long BUCKET_MS = 5000;

  void advance(unsigned long now) {
    if (!started) { started = true; curStart = now; return; }
    if (now - curStart >= BUCKET_MS * N) {  // idle longer than the window: all expired
      for (unsigned char i = 0; i < N; i++) used[i] = 0;
      curStart = now;
      return;
    }
    while (now - curStart >= BUCKET_MS) {
      curStart += BUCKET_MS;
      cur = (cur + 1) % N;
      used[cur] = 0;
    }
  }

  unsigned long used[N] = {};
  unsigned long curStart = 0;
  unsigned char cur = 0;
  bool started = false;
};

struct TrainerConfig {
  // --- Measured by handoff 01 on the leg (2026-10-10, hand-timed). Re-tune per person. ---
  unsigned long inflateMs = 30000;  // pump time, empty -> comfortably firm
  unsigned long ventMs = 3000;      // vent time, firm -> empty; real vent is non-linear, tune live with VENTMS:<n>

  // Never run the pump longer than this in one go. Must be longer than
  // inflateMs or the cuff can never reach full (~15% over is plenty).
  unsigned long pumpMaxRunMs = 35000;

  // Preload: at 1 G the cuff is pumped up to this baseline (pump time from
  // empty) and held there, then G adds squeeze on top, so a pull only has to
  // top up the last bit. 0 = no preload (1 G means an empty cuff).
  unsigned long preloadMs = 25000;

  // Sustained full: if fill stays >= fullHoldFill for fullHoldMaxMs, vent to the
  // baseline and stay there until G drops below gEmpty + 1.
  unsigned long fullHoldMaxMs = 20000;
  float fullHoldFill = 0.95f;

  // Total pump-on time allowed in any rolling 120 s window (flapping can't dodge the per-run cap).
  unsigned long pumpWindowBudgetMs = 60000;
  unsigned long testCooldownMs = 10000;  // TEST is a one-shot; next one allowed this long after it ends

  unsigned long deadmanMs = 500;    // no valid G line for this long -> vent
  unsigned long testPhaseMs = 2000; // TEST: inflate this long, then vent this long

  float gEmpty = 1.0f;              // at or below this G the cuff is empty
  float gFull = 6.0f;               // at or above this G the cuff is full
  float deadband = 0.05f;           // fill error ignored, stops relay chatter
};

enum TrainerMode { MODE_VENT, MODE_INFLATE, MODE_HOLD };

enum LineResult {
  LINE_G,        // valid G:<float>
  LINE_TEST,
  LINE_STOP,
  LINE_STATUS,
  LINE_CLEAR,    // clear an output-guard fault
  LINE_VENTMS,   // VENTMS:<n> accepted
  LINE_IGNORED   // malformed / unknown
};

class Trainer {
 public:
  explicit Trainer(const TrainerConfig& c = TrainerConfig()) : cfg(c) {}

  // Feed one complete line (without the newline). Never crashes on garbage.
  LineResult handleLine(const char* line, unsigned long now) {
    if (strcmp(line, "TEST") == 0) {
      // One-shot: not while stopped, not while running, not within the cooldown.
      if (stopped || testing) return LINE_IGNORED;
      if (haveTested && now - testEndMs < cfg.testCooldownMs) return LINE_IGNORED;
      testing = true;
      testStartMs = now;
      return LINE_TEST;
    }
    if (strcmp(line, "STOP") == 0) {
      stopped = true;
      endTest(now);
      return LINE_STOP;
    }
    if (strcmp(line, "STATUS") == 0) return LINE_STATUS;
    if (strcmp(line, "CLEAR") == 0) {
      fill = 1.0f;  // after a fault assume the worst: vent down to the target before inflating
      return LINE_CLEAR;
    }
    if (strncmp(line, "VENTMS:", 7) == 0) {
      const char* num = line + 7;
      if (*num < '0' || *num > '9') return LINE_IGNORED;  // no sign, space or empty
      char* end = nullptr;
      long n = strtol(num, &end, 10);                     // overflow saturates, fails the range check
      if (*end != '\0' || n < 500 || n > 10000) return LINE_IGNORED;
      cfg.ventMs = (unsigned long)n;
      return LINE_VENTMS;
    }

    if (line[0] != 'G' || line[1] != ':') return LINE_IGNORED;
    const char* num = line + 2;
    char* end = nullptr;
    double g = strtod(num, &end);
    if (end == num || *end != '\0') return LINE_IGNORED;  // not a clean number
    for (const char* c = num; *c; c++) {                   // digits . + - e E only: no inf, nan, hex
      if (!((*c >= '0' && *c <= '9') || *c == '.' || *c == '+' || *c == '-' || *c == 'e' || *c == 'E'))
        return LINE_IGNORED;
    }
    if (g != g || g - g != 0.0) return LINE_IGNORED;       // NaN or infinite (1e999)

    if (g < 0.0) g = 0.0;
    if (g > 9.0) g = 9.0;
    lastG = (float)g;
    targetFill = gToFill(lastG);
    lastValidMs = now;
    haveValid = true;
    stopped = false;  // a fresh G line resumes after STOP
    return LINE_G;
  }

  // Call every loop with millis(). Decides what the pump and valve do.
  void update(unsigned long now) {
    // 1. Advance the fill estimate using what the outputs were doing.
    unsigned long dt = now - lastUpdateMs;
    lastUpdateMs = now;
    if (mode == MODE_INFLATE) pumpWindow.add(now, dt);
    if (mode == MODE_INFLATE) {
      fill += (float)dt / (float)cfg.inflateMs;
    } else if (mode == MODE_VENT) {
      fill -= (float)dt / (float)cfg.ventMs;
    }
    if (fill < 0.0f) fill = 0.0f;
    if (fill > 1.0f) fill = 1.0f;

    // 2. Pick the mode.
    TrainerMode next;
    if (testing) {
      unsigned long e = now - testStartMs;
      if (e < cfg.testPhaseMs) {
        next = MODE_INFLATE;
      } else {
        next = MODE_VENT;
        if (e >= 2 * cfg.testPhaseMs) endTest(now);
      }
    } else {
      trackFullHold(now);
      float t = deadmanTripped(now) || stopped ? 0.0f : (fullClamp ? preloadFill() : targetFill);
      next = chooseMode(t);
    }

    // 3. Hard cap on continuous pump run.
    if (next == MODE_INFLATE && mode != MODE_INFLATE) pumpOnSinceMs = now;
    if (next == MODE_INFLATE && now - pumpOnSinceMs >= cfg.pumpMaxRunMs) {
      pumpLockout = true;
    }
    if (pumpLockout && next == MODE_INFLATE) next = MODE_HOLD;
    // Cumulative budget: flapping through HOLD or repeated TESTs can't restart it.
    if (next == MODE_INFLATE && pumpWindow.total(now) >= cfg.pumpWindowBudgetMs) next = MODE_HOLD;
    // Lockout clears only once the cuff is (estimated) fully vented.
    if (pumpLockout && fill <= 0.0f) pumpLockout = false;

    mode = next;
  }

  // Outputs. The pump never runs while the valve is open.
  bool pump() const { return mode == MODE_INFLATE; }
  bool valveClosed() const { return mode == MODE_INFLATE || mode == MODE_HOLD; }

  bool deadmanTripped(unsigned long now) const {
    return !haveValid || now - lastValidMs > cfg.deadmanMs;
  }

  // Read-only state, for STATUS and tests.
  float fillEstimate() const { return fill; }
  float target() const { return targetFill; }
  float g() const { return lastG; }
  TrainerMode currentMode() const { return mode; }
  bool lockedOut() const { return pumpLockout; }
  bool isTesting() const { return testing; }
  unsigned long pumpUsedMs(unsigned long now) { return pumpWindow.total(now); }
  bool fullClamped() const { return fullClamp; }

  TrainerConfig cfg;

 private:
  void endTest(unsigned long now) {
    if (testing) { testing = false; testEndMs = now; haveTested = true; }
  }

  // Full for fullHoldMaxMs -> clamp the target to the baseline until G is low again.
  void trackFullHold(unsigned long now) {
    if (fill >= cfg.fullHoldFill) {
      if (!atFull) { atFull = true; fullSinceMs = now; }
      if (now - fullSinceMs >= cfg.fullHoldMaxMs) fullClamp = true;
    } else {
      atFull = false;
    }
    if (fullClamp && (lastG < cfg.gEmpty + 1.0f || fill <= 0.0f)) fullClamp = false;
  }

  // Fill level held at 1 G: the preload, as a fraction of a full inflate.
  float preloadFill() const {
    float b = (float)cfg.preloadMs / (float)cfg.inflateMs;
    return b > 1.0f ? 1.0f : b;
  }

  // 1 G (or less) -> the preload baseline, gFull (or more) -> full, straight line between.
  float gToFill(float g) const {
    float f = (g - cfg.gEmpty) / (cfg.gFull - cfg.gEmpty);
    if (f < 0.0f) f = 0.0f;
    if (f > 1.0f) f = 1.0f;
    float base = preloadFill();
    return base + (1.0f - base) * f;
  }

  // Inflate until we reach the target, vent until we reach it, hold in
  // between. Only restart once the error is bigger than the deadband.
  TrainerMode chooseMode(float t) const {
    // Near-empty target (dead-man, STOP, or no preload at 1 G): vent all the
    // way. Using the deadband here (not 0) stops the valve clicking on sim
    // noise around 1 G in level flight.
    if (t <= cfg.deadband) return MODE_VENT;
    TrainerMode m = mode;
    if (m == MODE_INFLATE && fill >= t) m = MODE_HOLD;
    if (m == MODE_VENT && fill <= t) m = MODE_HOLD;
    if (m != MODE_INFLATE && fill < t - cfg.deadband) m = MODE_INFLATE;
    if (m != MODE_VENT && fill > t + cfg.deadband) m = MODE_VENT;
    return m;
  }

  TrainerMode mode = MODE_VENT;
  float fill = 0.0f;
  float targetFill = 0.0f;
  float lastG = 0.0f;
  bool haveValid = false;
  bool stopped = false;
  bool testing = false;
  bool pumpLockout = false;
  bool haveTested = false;
  unsigned long testEndMs = 0;
  PumpWindow pumpWindow;
  bool atFull = false;
  bool fullClamp = false;
  unsigned long fullSinceMs = 0;
  unsigned long lastValidMs = 0;
  unsigned long lastUpdateMs = 0;
  unsigned long pumpOnSinceMs = 0;
  unsigned long testStartMs = 0;
};

// Independent of the control logic: watches what the pump relay output is really
// doing. Pump continuously on past pumpMaxRunMs + grace -> latch a fault that
// forces pump and valve relays off (valve open = vent) until clear().
class OutputGuard {
 public:
  // Faults on one continuous run past pumpMaxRunMs + 2 s, or on total pump-on time
  // past windowBudgetMs + 2 s in the rolling window (gaps can't dodge it).
  explicit OutputGuard(unsigned long pumpMaxRunMs, unsigned long windowBudgetMs = 60000)
      : limitMs(pumpMaxRunMs + 2000), windowLimitMs(windowBudgetMs + 2000) {}

  // Pass the outputs the logic wants; they come back forced off while faulted.
  void apply(bool& pump, bool& valve, unsigned long now) {
    if (haveLast && lastPump) window.add(now, now - lastNow);
    lastNow = now;
    lastPump = pump && !fault;
    haveLast = true;
    if (!fault && pump) {
      if (!on) { on = true; since = now; }
      if (now - since > limitMs || window.total(now) > windowLimitMs) fault = true;
    }
    if (!pump) on = false;
    if (fault) { pump = false; valve = false; on = false; lastPump = false; }
  }

  bool faulted() const { return fault; }
  void clear() { fault = false; on = false; }

 private:
  unsigned long limitMs;
  unsigned long windowLimitMs;
  PumpWindow window;
  unsigned long since = 0;
  unsigned long lastNow = 0;
  bool lastPump = false;
  bool haveLast = false;
  bool on = false;
  bool fault = false;
};
