// Laptop unit tests for trainer_logic.h (no Arduino needed).
// Run:  g++ -std=c++11 -Wall -I../g_trainer test_logic.cpp -o test_logic && ./test_logic

#include <cstdio>
#include <vector>
#include "trainer_logic.h"

static int failures = 0;
#define CHECK(cond, msg)                                   \
  do {                                                     \
    if (!(cond)) { printf("FAIL: %s\n", msg); failures++; } \
    else printf("ok:   %s\n", msg);                        \
  } while (0)

// Run the trainer for `ms`, sending G lines at 20 Hz (or nothing if g < 0).
// Also checks the pump never runs with the valve open.
static unsigned long run(Trainer& t, unsigned long now, unsigned long ms, float g,
                         bool* pumpWithValveOpen = nullptr) {
  char buf[32];
  for (unsigned long e = 0; e < ms; e += 10, now += 10) {
    if (g >= 0 && e % 50 == 0) {
      snprintf(buf, sizeof buf, "G:%.2f", g);
      t.handleLine(buf, now);
    }
    t.update(now);
    if (pumpWithValveOpen && t.pump() && !t.valveClosed()) *pumpWithValveOpen = true;
  }
  return now;
}

int main() {
  // Old-style fast timings with NO preload, so the original behaviour tests stay valid.
  TrainerConfig cfg;
  cfg.inflateMs = 8000;
  cfg.ventMs = 4000;
  cfg.pumpMaxRunMs = 10000;
  cfg.preloadMs = 0;

  {
    Trainer t(cfg);
    t.update(1000);
    CHECK(!t.pump() && !t.valveClosed(), "starts vented with no signal");
  }

  {
    Trainer t(cfg);
    bool bad = false;
    unsigned long now = run(t, 1000, 9000, 6.0f, &bad);
    CHECK(t.fillEstimate() > 0.99f, "6 G fills the cuff within ~8 s");
    CHECK(t.currentMode() == MODE_HOLD, "holds once full (pump off, valve closed)");
    now = run(t, now, 5000, 1.0f, &bad);
    CHECK(t.fillEstimate() == 0.0f && !t.valveClosed(), "1 G vents to empty");
    CHECK(!bad, "pump never runs with valve open");
  }

  {
    Trainer t(cfg);
    unsigned long now = run(t, 1000, 3000, 3.5f);  // target 0.5
    now = run(t, now, 3000, 3.5f);
    float f = t.fillEstimate();
    CHECK(f > 0.44f && f < 0.56f, "3.5 G settles near half fill");
    int switches = 0;
    TrainerMode last = t.currentMode();
    char buf[32];
    for (int i = 0; i < 200; i++, now += 50) {  // jittery G around 3.5
      snprintf(buf, sizeof buf, "G:%.2f", 3.5f + ((i % 2) ? 0.05f : -0.05f));
      t.handleLine(buf, now);
      t.update(now);
      if (t.currentMode() != last) { switches++; last = t.currentMode(); }
    }
    CHECK(switches == 0, "deadband: small G jitter does not chatter the relays");
  }

  {
    Trainer t(cfg);
    unsigned long now = 1000;
    int toggles = 0;
    bool lastValve = t.valveClosed();
    char buf[32];
    for (int i = 0; i < 400; i++, now += 50) {  // level flight: G noise 0.96..1.04
      snprintf(buf, sizeof buf, "G:%.2f", 1.0f + 0.04f * ((i * 7) % 5 - 2) / 2.0f);
      t.handleLine(buf, now);
      t.update(now);
      if (t.valveClosed() != lastValve) { toggles++; lastValve = t.valveClosed(); }
    }
    CHECK(toggles == 0 && !t.valveClosed(), "level-flight G noise around 1.0 does not click the valve");
  }

  {
    Trainer t(cfg);
    unsigned long now = run(t, 1000, 3000, 6.0f);
    CHECK(t.pump(), "inflating while signal present");
    now = run(t, now, 600, -1);  // signal lost
    CHECK(!t.pump() && !t.valveClosed(), "dead-man: 500 ms without a line vents");
  }

  {
    Trainer t(cfg);
    const char* junk[] = {"", "G:", "G:abc", "G:3.2x", "g:3", "HELLO", "G:nan", "G:1e999x"};
    int ignored = 0;
    for (const char* j : junk) ignored += t.handleLine(j, 1000) == LINE_IGNORED;
    CHECK(ignored == 8, "malformed lines are ignored");
    CHECK(t.handleLine("G:12", 1000) == LINE_G && t.g() == 9.0f, "out-of-range G clamped to 9");
    CHECK(t.handleLine("G:-3", 1000) == LINE_G && t.g() == 0.0f, "negative G clamped to 0");
  }

  {
    TrainerConfig c2 = cfg;
    c2.pumpMaxRunMs = 3000;  // shorter than inflateMs, so the cap must trip
    Trainer t(c2);
    unsigned long now = run(t, 1000, 5000, 6.0f);
    CHECK(t.lockedOut() && !t.pump(), "pump cap stops a long run");
    now = run(t, now, 6000, 1.0f);
    CHECK(!t.lockedOut(), "cap clears after a full vent");
  }

  {
    Trainer t(cfg);
    t.handleLine("TEST", 1000);
    t.update(1000);
    t.update(1500);
    CHECK(t.pump() && t.valveClosed(), "TEST inflates first (no laptop needed)");
    t.update(3500);
    CHECK(!t.pump() && !t.valveClosed(), "TEST then vents");
    t.update(5500);
    CHECK(!t.isTesting(), "TEST finishes after 4 s");
  }

  {
    Trainer t(cfg);
    unsigned long now = run(t, 1000, 2000, 6.0f);
    t.handleLine("STOP", now);
    t.update(now + 10);
    CHECK(!t.pump() && !t.valveClosed(), "STOP vents immediately");
  }

  // ---- Preload: pump to a comfortable baseline first, then follow G from there ----
  {
    TrainerConfig p = cfg;
    p.preloadMs = 5000;  // 5 s of an 8 s inflate = 0.625 fill baseline
    Trainer t(p);
    bool bad = false;
    unsigned long now = run(t, 1000, 7000, 1.0f, &bad);  // level flight from a cold start
    CHECK(t.fillEstimate() > 0.60f && t.fillEstimate() < 0.66f, "preload: 1 G pumps up to the baseline first");
    CHECK(t.currentMode() == MODE_HOLD && t.valveClosed() && !t.pump(), "preload: holds at the baseline (valve closed, pump off)");
    now = run(t, now, 4000, 6.0f, &bad);
    CHECK(t.fillEstimate() > 0.99f, "preload: 6 G tops up to full from the baseline");
    now = run(t, now, 4000, 1.0f, &bad);
    CHECK(t.fillEstimate() > 0.58f && t.fillEstimate() < 0.68f && t.valveClosed(),
          "preload: back at 1 G it vents only down to the baseline, not empty");
    CHECK(!bad, "preload: pump never runs with valve open");
  }

  {
    TrainerConfig p = cfg;
    p.preloadMs = 5000;
    Trainer t(p);
    unsigned long now = run(t, 1000, 7000, 1.0f);
    now = run(t, now, 600, -1);  // signal lost
    CHECK(!t.pump() && !t.valveClosed(), "preload: dead-man still vents (valve open)");
    now = run(t, now, 4500, -1);
    CHECK(t.fillEstimate() == 0.0f, "preload: dead-man vents all the way to empty");
    now = run(t, now, 7000, 1.0f);
    CHECK(t.fillEstimate() > 0.60f && t.fillEstimate() < 0.66f, "preload: re-preps after the signal returns");
  }

  {
    TrainerConfig p = cfg;
    p.preloadMs = 5000;
    Trainer t(p);
    run(t, 1000, 7000, 0.0f);  // dead sim feed reading 0 G
    CHECK(t.fillEstimate() > 0.60f && t.fillEstimate() < 0.66f, "preload: G below 1 never goes below the baseline");
  }

  {
    TrainerConfig p = cfg;
    p.preloadMs = 12000;  // longer than inflateMs: clamped to full, never exceeds 1.0
    Trainer t(p);
    run(t, 1000, 12000, 1.0f);
    CHECK(t.fillEstimate() <= 1.0f && t.target() <= 1.0f, "preload: a preload longer than inflateMs is clamped");
  }

  {
    TrainerConfig real;  // the real defaults measured by 01: 30 s to firm, 25 s preload, 35 s cap
    CHECK(real.inflateMs == 30000 && real.ventMs == 3000 && real.pumpMaxRunMs == 35000 && real.preloadMs == 25000,
          "defaults match 01's on-leg measurements");
    Trainer t(real);
    bool bad = false;
    unsigned long now = run(t, 1000, 26000, 1.0f, &bad);
    CHECK(t.fillEstimate() > 0.80f && t.fillEstimate() < 0.87f && !t.lockedOut(), "real defaults: about 25 s preps to the baseline");
    now = run(t, now, 7000, 6.0f, &bad);
    CHECK(t.fillEstimate() > 0.99f && !t.lockedOut(), "real defaults: top-up to full stays under the pump cap");
    CHECK(!bad, "real defaults: pump never runs with valve open");

    // ventMs 3000: 6 G -> 1 G needs ~0.5 s of open valve (full to baseline is 17% of 3 s).
    now = run(t, now, 700, 1.0f, &bad);
    CHECK(t.fillEstimate() > 0.80f && t.fillEstimate() < 0.87f, "real defaults: back to the baseline after 0.7 s, no overshoot");
    CHECK(t.currentMode() == MODE_HOLD, "real defaults: holds (valve shut) at the baseline once vented");
  }

  {
    Trainer t(cfg);
    unsigned long start = 0xFFFFFFFFUL - 2000;  // millis() wraps after ~49 days
    run(t, start, 9000, 6.0f);
    CHECK(t.fillEstimate() > 0.99f, "survives millis() rollover");
  }


  // ---- Full-hold limit: sustained high G must not hold the cuff full forever ----
  {
    TrainerConfig p = cfg;
    p.preloadMs = 5000;  // baseline 0.625
    Trainer t(p);
    bool bad = false;
    unsigned long now = 1000, fullFor = 0, maxFull = 0;
    for (int i = 0; i < 6000; i++, now += 10) {  // 60 s at 9 G
      if (i % 5 == 0) t.handleLine("G:9.0", now);
      t.update(now);
      if (t.pump() && !t.valveClosed()) bad = true;
      if (t.fillEstimate() >= p.fullHoldFill) fullFor += 10; else fullFor = 0;
      if (fullFor > maxFull) maxFull = fullFor;
    }
    CHECK(maxFull <= p.fullHoldMaxMs + 300, "full-hold: never holds full longer than fullHoldMaxMs");
    CHECK(maxFull >= p.fullHoldMaxMs - 100, "full-hold: does hold full for about fullHoldMaxMs first");
    CHECK(t.fillEstimate() > 0.60f && t.fillEstimate() < 0.66f, "full-hold: forced down to the baseline and stays there at 9 G");
    CHECK(t.target() >= 0.99f, "full-hold: raw target untouched (clamp is separate)");
    CHECK(!bad, "full-hold: pump never runs with valve open");
    now = run(t, now, 1000, 1.0f);            // G drops below 2
    now = run(t, now, 5000, 6.0f);            // next pull
    CHECK(t.fillEstimate() > 0.99f, "full-hold: re-arms after G drops, next pull fills again");
  }

  {
    TrainerConfig p = cfg;
    p.preloadMs = 5000;
    Trainer t(p);
    unsigned long now = run(t, 1000, 7000, 1.0f);   // preload
    now = run(t, now, 15000, 6.0f);                  // pull shorter than the limit
    CHECK(t.fillEstimate() > 0.99f, "full-hold: short pull stays full");
    now = run(t, now, 1000, 1.0f);
    now = run(t, now, 15000, 6.0f);                  // second short pull after a gap
    CHECK(t.fillEstimate() > 0.99f, "full-hold: timer does not accumulate across pulls");
  }

  {
    TrainerConfig p = cfg;
    p.preloadMs = 5000;
    Trainer t(p);
    unsigned long now = run(t, 1000, 40000, 9.0f);  // clamped by now
    run(t, now, 600, -1);
    now += 600;
    now = run(t, now, 5000, -1);
    CHECK(t.fillEstimate() == 0.0f && !t.valveClosed(), "full-hold: dead-man while clamped still vents to empty");
    Trainer u(p);
    now = run(u, 1000, 15000, 6.0f);
    u.handleLine("STOP", now);
    run(u, now, 5000, -1);
    CHECK(u.fillEstimate() == 0.0f && !u.valveClosed(), "full-hold: STOP while full vents to empty");
  }

  {
    TrainerConfig p = cfg;
    p.preloadMs = 5000;
    Trainer t(p);
    unsigned long start = 0xFFFFFFFFUL - 10000;
    run(t, start, 40000, 9.0f);  // clamp timer spans the wrap
    CHECK(t.fillEstimate() > 0.60f && t.fillEstimate() < 0.66f, "full-hold: clamp works across millis() rollover");
  }

  {
    TrainerConfig real;
    CHECK(real.fullHoldMaxMs == 20000 && real.fullHoldFill == 0.95f, "full-hold: defaults 20 s / 0.95");
  }

  // ---- Independent output guard: watches the real pump output, not the logic ----
  {
    OutputGuard g(10000);
    bool pump = true, valve = true;
    unsigned long now = 5000;
    g.apply(pump, valve, now);
    now += 12000;
    pump = true; valve = true;
    g.apply(pump, valve, now);
    CHECK(!g.faulted() && pump && valve, "guard: pump on for exactly limit (10 s + 2 s grace) is not a fault");
    now += 1;
    pump = true; valve = true;
    g.apply(pump, valve, now);
    CHECK(g.faulted() && !pump && !valve, "guard: pump on past limit + 2 s latches a fault, both outputs off");
    pump = true; valve = true;
    g.apply(pump, valve, now + 10);
    CHECK(!pump && !valve, "guard: fault keeps forcing both outputs off");
    g.clear();
    pump = true; valve = true;
    g.apply(pump, valve, now + 20);
    CHECK(!g.faulted() && pump && valve, "guard: CLEAR re-enables outputs");
  }

  {
    OutputGuard g(10000);
    bool pump, valve;
    unsigned long now = 0;
    for (int k = 0; k < 3; k++) {  // 8 s on, 1 s off, repeated: runs are never continuous > limit
      for (int i = 0; i < 800; i++, now += 10) { pump = valve = true; g.apply(pump, valve, now); }
      pump = false; valve = true; g.apply(pump, valve, now); now += 1000;
    }
    CHECK(!g.faulted(), "guard: an off period resets the continuous-run timer");
    OutputGuard h(10000);
    unsigned long start = 0xFFFFFFFFUL - 3000;  // wrap inside the run
    for (unsigned long e = 0; e < 14000; e += 10) { pump = valve = true; h.apply(pump, valve, start + e); }
    CHECK(h.faulted(), "guard: faults across millis() rollover too");
  }

  {
    Trainer t(cfg);
    CHECK(t.handleLine("CLEAR", 1000) == LINE_CLEAR, "CLEAR is recognised");
  }

  // ---- VENTMS: runtime vent tuning ----
  {
    Trainer t(cfg);
    CHECK(t.handleLine("VENTMS:2500", 1000) == LINE_VENTMS && t.cfg.ventMs == 2500, "VENTMS:2500 accepted");
    CHECK(t.handleLine("VENTMS:500", 1000) == LINE_VENTMS && t.cfg.ventMs == 500, "VENTMS lower bound 500 accepted");
    CHECK(t.handleLine("VENTMS:10000", 1000) == LINE_VENTMS && t.cfg.ventMs == 10000, "VENTMS upper bound 10000 accepted");
    unsigned long before = t.cfg.ventMs;
    const char* bad[] = {"VENTMS:499", "VENTMS:10001", "VENTMS:0", "VENTMS:-800", "VENTMS:abc", "VENTMS:",
                         "VENTMS:99999999999", "VENTMS:2500x", "VENTMS: 2500", "VENTMS:+2500", "VENTMS:2.5e3", "VENTMS"};
    int ignored = 0;
    for (const char* b : bad) ignored += t.handleLine(b, 1000) == LINE_IGNORED;
    CHECK(ignored == 12 && t.cfg.ventMs == before, "bad VENTMS values ignored, ventMs unchanged");
    TrainerConfig c = cfg;
    Trainer u(c);
    unsigned long inflate = u.cfg.inflateMs, pre = u.cfg.preloadMs, cap = u.cfg.pumpMaxRunMs;
    u.handleLine("VENTMS:2000", 1000);
    CHECK(u.cfg.inflateMs == inflate && u.cfg.preloadMs == pre && u.cfg.pumpMaxRunMs == cap, "VENTMS changes nothing else");
  }


  // ---- G: payload must be a clean finite number (no inf/nan/hex/trailing junk) ----
  {
    Trainer t(cfg);
    const char* junk[] = {"G:inf", "G:nan", "G:INF", "G:NaN", "G:-inf", "G:infinity", "G:1e999", "G:-1e999",
                          "G:0x10", "G:6.0abc", "G:", "G: 6", "G:6 "};
    int ignored = 0;
    for (const char* j : junk) ignored += t.handleLine(j, 1000) == LINE_IGNORED;
    CHECK(ignored == 13, "inf/nan/INF/1e999/0x10/trailing junk/empty G payloads are all ignored");
    CHECK(t.target() == 0.0f && t.g() == 0.0f, "ignored G lines change nothing");
    CHECK(t.handleLine("G:6.0", 1000) == LINE_G && t.g() == 6.0f, "G:6.0 still handled");
    CHECK(t.handleLine("G:6", 1000) == LINE_G && t.g() == 6.0f, "G:6 still handled");
    CHECK(t.handleLine("G:6e0", 1000) == LINE_G && t.g() == 6.0f, "G:6e0 still handled");
    CHECK(t.handleLine("G:-1", 1000) == LINE_G && t.g() == 0.0f, "G:-1 still handled (clamped to 0)");
    CHECK(t.handleLine("G:+2.5", 1000) == LINE_G && t.g() == 2.5f, "G:+2.5 still handled");
  }

  // ---- Cumulative pump budget: rolling 120 s window ----
  {
    TrainerConfig b = cfg;
    b.pumpMaxRunMs = 20000;
    Trainer t(b);
    bool bad = false;
    std::vector<char> on;  // pump state per 10 ms
    unsigned long now = 1000;
    for (int cycle = 0; cycle < 40; cycle++) {  // 6 G / 1 G flapping, every cycle re-pumps
      for (int k = 0; k < 2; k++) {
        float g = k == 0 ? 6.0f : 1.0f;
        for (unsigned long e = 0; e < 7000; e += 10, now += 10) {
          if (e % 50 == 0) { char buf[16]; snprintf(buf, sizeof buf, "G:%.1f", g); t.handleLine(buf, now); }
          t.update(now);
          if (t.pump() && !t.valveClosed()) bad = true;
          on.push_back(t.pump());
        }
      }
    }
    unsigned long worst = 0, win = 0, total = 0;
    for (size_t i = 0; i < on.size(); i++) {
      win += on[i] ? 10 : 0; total += on[i] ? 10 : 0;
      if (i >= 12000) win -= on[i - 12000] ? 10 : 0;
      if (win > worst) worst = win;
    }
    CHECK(worst <= b.pumpWindowBudgetMs + 50, "budget: flapping INFLATE/HOLD never exceeds the budget in any 120 s window");
    CHECK(total > b.pumpWindowBudgetMs, "budget: the flapping scenario really did try to pump more than the budget");
    CHECK(!bad, "budget: pump never runs with valve open");
  }

  {
    TrainerConfig b = cfg;
    b.pumpMaxRunMs = 20000;
    Trainer t(b);
    unsigned long now = 1000;
    for (int i = 0; i < 9; i++) { now = run(t, now, 7000, 6.0f); now = run(t, now, 4500, 1.0f); }
    CHECK(t.pumpUsedMs(now) >= b.pumpWindowBudgetMs - 100, "budget: gets exhausted by repeated pulls");
    now = run(t, now, 7000, 6.0f);
    CHECK(!t.pump(), "budget: exhausted -> no pumping even though the target is high");
    now = run(t, now, 30000, 1.0f);
    CHECK(t.pumpUsedMs(now) > 0, "budget: still counted 30 s later");
    now = run(t, now, 130000, 1.0f);
    CHECK(t.pumpUsedMs(now) == 0, "budget: window frees up after 125 s");
    now = run(t, now, 9000, 6.0f);
    CHECK(t.fillEstimate() > 0.99f, "budget: pumping works again after the window frees up");
  }

  {
    TrainerConfig b = cfg;
    b.pumpMaxRunMs = 20000;
    Trainer t(b);
    unsigned long now = 0xFFFFFFFFUL - 50000;  // window straddles the millis() wrap
    for (int i = 0; i < 9; i++) { now = run(t, now, 7000, 6.0f); now = run(t, now, 4500, 1.0f); }
    CHECK(t.pumpUsedMs(now) >= b.pumpWindowBudgetMs - 100 && t.pumpUsedMs(now) <= b.pumpWindowBudgetMs + 50,
          "budget: counts correctly across millis() rollover");
    now = run(t, now, 7000, 6.0f);
    CHECK(!t.pump(), "budget: still enforced across millis() rollover");
    now = run(t, now, 130000, 1.0f);
    CHECK(t.pumpUsedMs(now) == 0, "budget: frees up across millis() rollover");
  }

  {
    TrainerConfig r;
    CHECK(r.pumpWindowBudgetMs == 60000 && r.testCooldownMs == 10000, "budget: defaults 60 s per window, 10 s test cooldown");
  }

  // ---- TEST is a one-shot with a cooldown, and respects STOP and the budget ----
  {
    Trainer t(cfg);
    CHECK(t.handleLine("TEST", 1000) == LINE_TEST, "TEST: first one accepted");
    t.update(1000);
    CHECK(t.handleLine("TEST", 1500) == LINE_IGNORED, "TEST: ignored while one is running");
    unsigned long now = 1000;
    for (; now < 6000; now += 10) t.update(now);
    CHECK(!t.isTesting(), "TEST: finished");
    CHECK(t.handleLine("TEST", 6000) == LINE_IGNORED, "TEST: ignored during the cooldown after a test");
    CHECK(t.handleLine("TEST", 6000 + 8000) == LINE_IGNORED, "TEST: still ignored just under 10 s after it ended");
    CHECK(t.handleLine("TEST", 6000 + 11000) == LINE_TEST, "TEST: accepted again after the cooldown");
  }

  {
    Trainer t(cfg);
    unsigned long start = 0xFFFFFFFFUL - 3000;
    t.handleLine("TEST", start);
    unsigned long now = start;
    for (int i = 0; i < 500; i++, now += 10) t.update(now);
    CHECK(!t.isTesting() && t.handleLine("TEST", now) == LINE_IGNORED, "TEST: cooldown holds across millis() rollover");
    CHECK(t.handleLine("TEST", now + 11000) == LINE_TEST, "TEST: cooldown ends across millis() rollover");
  }

  {
    Trainer t(cfg);
    t.handleLine("STOP", 1000);
    CHECK(t.handleLine("TEST", 1010) == LINE_IGNORED, "TEST: ignored while STOP is active");
    t.update(1010);
    CHECK(!t.pump(), "TEST: STOP keeps the pump off");
    Trainer u(cfg);
    u.handleLine("TEST", 1000);
    u.update(1000); u.update(1500);
    CHECK(u.pump(), "TEST: pumps (before STOP)");
    u.handleLine("STOP", 1600);
    u.update(1610);
    CHECK(!u.pump() && !u.valveClosed() && !u.isTesting(), "TEST: STOP aborts a running test and vents");
  }

  {
    TrainerConfig b = cfg;
    b.pumpMaxRunMs = 20000;
    b.pumpWindowBudgetMs = 3000;
    b.testPhaseMs = 2000;
    Trainer t(b);
    t.handleLine("TEST", 1000);
    bool pumped = false;
    unsigned long now = 1000;
    for (; now < 5000; now += 10) { t.update(now); pumped = pumped || t.pump(); }
    CHECK(pumped, "TEST budget: first test pumps");
    unsigned long on = 0;
    for (int k = 0; k < 8; k++) {
      now += 10500;  // past the cooldown each time
      t.handleLine("TEST", now);
      for (unsigned long e = 0; e < 4000; e += 10, now += 10) { t.update(now); on += t.pump() ? 10 : 0; }
    }
    CHECK(t.pumpUsedMs(now) <= b.pumpWindowBudgetMs + 50, "TEST budget: repeated TESTs cannot exceed the window budget");
    CHECK(on < 8 * 2000, "TEST budget: later tests were cut short by the budget");
  }

  {
    OutputGuard g(10000, 20000);
    bool pump, valve;
    unsigned long now = 0;
    for (int i = 0; i < 60 && !g.faulted(); i++) {  // 9 s on, 1 s off: never continuous > 12 s
      for (int k = 0; k < 900; k++, now += 10) { pump = valve = true; g.apply(pump, valve, now); }
      pump = false; valve = true; g.apply(pump, valve, now); now += 1000;
    }
    CHECK(g.faulted(), "guard: cumulative pump time past the window budget + 2 s faults even with off gaps");
    pump = valve = true; g.apply(pump, valve, now);
    CHECK(!pump && !valve, "guard: cumulative fault forces both outputs off");
  }

  printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "ALL PASSED", failures,
         failures == 1 ? "" : "s");
  return failures ? 1 : 0;
}
