// trainer_logic.h - the cuff control logic, with no Arduino-specific code.
//
// Kept separate from g_trainer.ino so it can be unit-tested on a laptop
// (see firmware/test/). The .ino file only reads serial, feeds lines in here,
// calls update() every loop, and copies pump()/valveClosed() to the relays.
//
// Hardware assumption: the vent solenoid is NORMALLY OPEN.
//   valve unpowered = open   = cuff vents  (fail-safe)
//   valve powered   = closed = cuff holds / can inflate
// So "everything off" is always the safe state.

#pragma once

#include <stdlib.h>
#include <string.h>

struct TrainerConfig {
  // --- Measured by handoff 01 on the leg (2026-10-10, hand-timed). Re-tune per person. ---
  unsigned long inflateMs = 30000;  // pump time, empty -> comfortably firm
  unsigned long ventMs = 5000;      // vent time, firm -> empty (include the slow tail)

  // Never run the pump longer than this in one go. Must be longer than
  // inflateMs or the cuff can never reach full (~15% over is plenty).
  unsigned long pumpMaxRunMs = 35000;

  // Preload: at 1 G the cuff is pumped up to this baseline (pump time from
  // empty) and held there, then G adds squeeze on top, so a pull only has to
  // top up the last bit. 0 = no preload (1 G means an empty cuff).
  unsigned long preloadMs = 25000;

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
  LINE_IGNORED   // malformed / unknown
};

class Trainer {
 public:
  explicit Trainer(const TrainerConfig& c = TrainerConfig()) : cfg(c) {}

  // Feed one complete line (without the newline). Never crashes on garbage.
  LineResult handleLine(const char* line, unsigned long now) {
    if (strcmp(line, "TEST") == 0) {
      testing = true;
      testStartMs = now;
      return LINE_TEST;
    }
    if (strcmp(line, "STOP") == 0) {
      stopped = true;
      testing = false;
      return LINE_STOP;
    }
    if (strcmp(line, "STATUS") == 0) return LINE_STATUS;

    if (line[0] != 'G' || line[1] != ':') return LINE_IGNORED;
    const char* num = line + 2;
    char* end = nullptr;
    double g = strtod(num, &end);
    if (end == num || *end != '\0') return LINE_IGNORED;  // not a clean number
    if (g != g) return LINE_IGNORED;                       // NaN

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
        if (e >= 2 * cfg.testPhaseMs) testing = false;
      }
    } else {
      float t = deadmanTripped(now) || stopped ? 0.0f : targetFill;
      next = chooseMode(t);
    }

    // 3. Hard cap on continuous pump run.
    if (next == MODE_INFLATE && mode != MODE_INFLATE) pumpOnSinceMs = now;
    if (next == MODE_INFLATE && now - pumpOnSinceMs >= cfg.pumpMaxRunMs) {
      pumpLockout = true;
    }
    if (pumpLockout && next == MODE_INFLATE) next = MODE_HOLD;
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

  TrainerConfig cfg;

 private:
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
  unsigned long lastValidMs = 0;
  unsigned long lastUpdateMs = 0;
  unsigned long pumpOnSinceMs = 0;
  unsigned long testStartMs = 0;
};
