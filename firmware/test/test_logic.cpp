// Laptop unit tests for trainer_logic.h (no Arduino needed).
// Run:  g++ -std=c++11 -Wall -I../g_trainer test_logic.cpp -o test_logic && ./test_logic

#include <cstdio>
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
    CHECK(real.inflateMs == 30000 && real.ventMs == 1200 && real.pumpMaxRunMs == 35000 && real.preloadMs == 25000,
          "defaults match 01's on-leg measurements");
    Trainer t(real);
    bool bad = false;
    unsigned long now = run(t, 1000, 26000, 1.0f, &bad);
    CHECK(t.fillEstimate() > 0.80f && t.fillEstimate() < 0.87f && !t.lockedOut(), "real defaults: about 25 s preps to the baseline");
    now = run(t, now, 7000, 6.0f, &bad);
    CHECK(t.fillEstimate() > 0.99f && !t.lockedOut(), "real defaults: top-up to full stays under the pump cap");
    CHECK(!bad, "real defaults: pump never runs with valve open");

    // 01 measured the vent on the rig: baseline -> flat in 1 s, so 6 G -> 1 G only
    // needs ~0.2 s of open valve (full to baseline is 17% of the 1.2 s full vent).
    now = run(t, now, 500, 1.0f, &bad);
    CHECK(t.fillEstimate() > 0.80f && t.fillEstimate() < 0.87f, "real defaults: back to the baseline after 0.5 s, no overshoot");
    CHECK(t.currentMode() == MODE_HOLD, "real defaults: holds (valve shut) at the baseline once vented");
  }

  {
    Trainer t(cfg);
    unsigned long start = 0xFFFFFFFFUL - 2000;  // millis() wraps after ~49 days
    run(t, start, 9000, 6.0f);
    CHECK(t.fillEstimate() > 0.99f, "survives millis() rollover");
  }

  printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "ALL PASSED", failures,
         failures == 1 ? "" : "s");
  return failures ? 1 : 0;
}
