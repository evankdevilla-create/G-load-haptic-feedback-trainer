/**
 * Manual flight mode. The cuff is driven by `g`, so the things that matter are
 * the invariants: never exceed the pilot/wing G limit, never hit the ground,
 * never go non-finite, whatever the stick does.
 */

import { describe, expect, it } from "vitest";
import {
  G0,
  MANUAL_ONSET_RATE,
  calmed,
  PHYSICS_DT,
  PILOT_MAX_G,
  PILOT_MIN_G,
  initialManualState,
  maxLoadFactor,
  stepManual,
} from "../src/flight/dynamics";
import { NEUTRAL_INPUT } from "../src/flight/types";
import type { FlightState, PilotInput, Route } from "../src/flight/types";

const deg = (rad: number) => (rad * 180) / Math.PI;
const V_MIN = 60;

function manualRoute(altitude = 2000, speed = 220): Route {
  return { name: "manual", start: { altitude, speed, headingDeg: 0 }, legs: [] };
}

/** Fly with an input function of time; hand back every state. */
function flyManual(
  route: Route,
  seconds: number,
  input: (t: number) => PilotInput,
): FlightState[] {
  let s = initialManualState(route);
  const out = [s];
  const ticks = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < ticks; i++) {
    s = stepManual(s, input(s.t));
    out.push(s);
  }
  return out;
}

/** Small seeded PRNG (mulberry32) so the fuzz is reproducible. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const last = <T>(a: T[]): T => a[a.length - 1] as T;

describe("manual: initial state", () => {
  it("starts from the route start, on leg 0, not finished", () => {
    const s = initialManualState(manualRoute(1500, 200));
    expect(s.pos.y).toBe(1500);
    expect(s.v).toBe(200);
    expect(s.legIndex).toBe(0);
    expect(s.finished).toBe(false);
    expect(s.g).toBe(1);
  });
});

describe("manual: hands off", () => {
  it("holds altitude and 1 G for 120 s", () => {
    const states = flyManual(manualRoute(), 120, () => NEUTRAL_INPUT);
    for (const s of states) {
      expect(Math.abs(s.pos.y - 2000)).toBeLessThan(5);
      expect(s.g).toBeCloseTo(1, 3);
      expect(s.finished).toBe(false);
    }
  });
});

describe("manual: ground collision", () => {
  const dive = () => flyManual(manualRoute(), 120, () => ({ pitch: -1, roll: 0, throttle: 0.5 }));

  it("flying into the ground ends in a crash, never below the ground", () => {
    const states = dive();
    expect(states.some((s) => s.crashed)).toBe(true);
    expect(Math.min(...states.map((s) => s.pos.y))).toBeGreaterThanOrEqual(0);
  });

  it("a crash freezes the aircraft: no speed, G back to 1, and it stays put", () => {
    const states = dive();
    const first = states.find((s) => s.crashed);
    expect(first).toBeDefined();
    const c = first as FlightState;
    expect(c.v).toBe(0);
    expect(c.g).toBe(1);
    expect(c.pos.y).toBe(0);
    const later = stepManual(stepManual(c, { pitch: 1, roll: 1, throttle: 1 }), NEUTRAL_INPUT);
    expect(later).toEqual(c);
  });

  it("the impact never reaches the cuff: G stays within the pilot cap and ends at 1", () => {
    for (const s of dive()) {
      expect(s.g).toBeLessThanOrEqual(PILOT_MAX_G + 1e-9);
      expect(s.g).toBeGreaterThanOrEqual(PILOT_MIN_G - 1e-9);
    }
    expect(last(dive()).g).toBe(1);
  });

  it("hands-off level flight and a normal climb never crash", () => {
    expect(flyManual(manualRoute(), 120, () => NEUTRAL_INPUT).some((s) => s.crashed)).toBe(false);
    expect(flyManual(manualRoute(), 30, () => ({ pitch: 0.5, roll: 0, throttle: 0.7 })).some((s) => s.crashed)).toBe(false);
  });

  it("a crash is reported in a single, consistent state (no NaN)", () => {
    const c = last(dive());
    expect(Number.isFinite(c.pos.x + c.pos.y + c.pos.z + c.psi + c.gamma + c.phi + c.alpha)).toBe(true);
  });

  it("does not climb far past the soft ceiling", () => {
    const states = flyManual(manualRoute(11000, 250), 240, () => ({ pitch: 1, roll: 0, throttle: 1 }));
    expect(Math.max(...states.map((s) => s.pos.y))).toBeLessThan(14000);
  });
});

describe("calmed (resume after pause / kill / panic)", () => {
  it("drops G to 1 so the cuff cannot jump from empty to the old G on resume", () => {
    const pulling = last(flyManual(manualRoute(), 6, () => ({ pitch: 1, roll: 0, throttle: 0.5 })));
    expect(pulling.g).toBeGreaterThan(5);
    const c = calmed(pulling);
    expect(c.g).toBe(1);
    expect(c.gCommanded).toBe(1);
    // Even with the stick still held, G climbs from 1 at the manual onset rate.
    const next = stepManual(c, { pitch: 1, roll: 0, throttle: 0.5 });
    expect(next.g - 1).toBeLessThanOrEqual(MANUAL_ONSET_RATE * PHYSICS_DT + 1e-9);
  });
  it("keeps everything else (position, speed, heading) as it was", () => {
    const s = last(flyManual(manualRoute(), 3, () => ({ pitch: 0.5, roll: 0.5, throttle: 0.5 })));
    const c = calmed(s);
    expect(c.pos).toEqual(s.pos);
    expect(c.v).toBe(s.v);
    expect(c.psi).toBe(s.psi);
  });
});

describe("manual: G limits", () => {
  it("never exceeds PILOT_MAX_G or the wing limit on a sustained full pull", () => {
    const states = flyManual(manualRoute(), 60, () => ({ pitch: 1, roll: 0, throttle: 0.5 }));
    for (const s of states) {
      expect(s.g).toBeLessThanOrEqual(PILOT_MAX_G + 1e-9);
      expect(s.g).toBeLessThanOrEqual(maxLoadFactor(s.v) + 1e-9);
    }
    // And full pull really does get close to the limit in level flight.
    expect(Math.max(...states.map((s) => s.g))).toBeGreaterThan(PILOT_MAX_G - 0.5);
  });

  it("slow-speed full pull never exceeds the wing limit or stalls", () => {
    const states = flyManual(manualRoute(3000, 70), 60, () => ({ pitch: 1, roll: 0, throttle: 0 }));
    for (const s of states) {
      expect(s.g).toBeLessThanOrEqual(PILOT_MAX_G + 1e-9);
      expect(s.g).toBeLessThanOrEqual(maxLoadFactor(s.v) + 1e-9);
      expect(s.v).toBeGreaterThanOrEqual(V_MIN);
      expect(s.pos.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("a hard push-over bottoms out at the -1.5 G pilot floor (downward motion as originally tuned)", () => {
    expect(PILOT_MIN_G).toBe(-1.5);
    const states = flyManual(manualRoute(), 6, () => ({ pitch: -1, roll: 0, throttle: 0.5 }));
    const min = Math.min(...states.map((s) => s.g));
    expect(min).toBeGreaterThanOrEqual(-1.5 - 1e-9);
    expect(min).toBeLessThan(-1.4);
  });

  it("never goes below PILOT_MIN_G", () => {
    const states = flyManual(manualRoute(), 30, () => ({ pitch: -1, roll: 0, throttle: 0.5 }));
    for (const s of states) expect(s.g).toBeGreaterThanOrEqual(PILOT_MIN_G - 1e-9);
  });

  it("a held pull ramps G up no faster than the judge-safe manual onset", () => {
    const states = flyManual(manualRoute(), 6, () => ({ pitch: 1, roll: 0, throttle: 0.5 }));
    for (let i = 1; i < states.length; i++) {
      const rate = ((states[i] as FlightState).g - (states[i - 1] as FlightState).g) / PHYSICS_DT;
      expect(rate).toBeLessThanOrEqual(MANUAL_ONSET_RATE + 1e-6);
    }
    // 1 G to 6 G is 5 G of ramp: at 2 G/s that cannot take under 2.4 s.
    const tFull = states.find((s) => s.g >= 5.99)?.t ?? Infinity;
    expect(tFull).toBeGreaterThanOrEqual(2.4);
  });

  it("G comes off faster than it goes on (deflating is the safe direction)", () => {
    const up = flyManual(manualRoute(), 4, () => ({ pitch: 1, roll: 0, throttle: 0.5 }));
    const peak = last(up);
    let s = peak;
    let t0 = s.t;
    while (s.g > 1.5 && s.t - t0 < 10) s = stepManual(s, NEUTRAL_INPUT);
    expect(s.t - t0).toBeLessThan((peak.g - 1.5) / MANUAL_ONSET_RATE);
  });

  it("never steps G faster than the onset rate", () => {
    const states = flyManual(manualRoute(), 20, (t) => ({
      pitch: t < 5 ? 1 : -1,
      roll: 0,
      throttle: 0.5,
    }));
    for (let i = 1; i < states.length; i++) {
      // Small slack: the wing limit can pull g down a hair beyond the ramp.
      expect(Math.abs((states[i] as FlightState).g - (states[i - 1] as FlightState).g)).toBeLessThan(4 * PHYSICS_DT + 0.01);
    }
  });

  it("releasing the stick returns g to about 1 within a few seconds", () => {
    const states = flyManual(manualRoute(), 8, (t) => ({
      pitch: t < 0.5 ? 1 : 0,
      roll: 0,
      throttle: 0.5,
    }));
    expect(Math.max(...states.map((s) => s.g))).toBeGreaterThan(2);
    expect(last(states).g).toBeCloseTo(1, 1);
  });
});

describe("manual: roll", () => {
  it("roll is a rate command: banking is limited to the roll rate and caps at 80 degrees", () => {
    const right = flyManual(manualRoute(), 5, () => ({ pitch: 0, roll: 1, throttle: 0.5 }));
    expect(deg(last(right).phi)).toBeCloseTo(80, 3);
    const left = flyManual(manualRoute(), 5, () => ({ pitch: 0, roll: -1, throttle: 0.5 }));
    expect(deg(last(left).phi)).toBeCloseTo(-80, 3);
    // 0.2 s of full roll at 150 deg/s is 30 degrees, not a jump to the cap.
    const brief = flyManual(manualRoute(), 0.2, () => ({ pitch: 0, roll: 1, throttle: 0.5 }));
    expect(deg(last(brief).phi)).toBeCloseTo(30, 0);
  });

  it("the bank STAYS where the stick left it: no automatic return to wings level", () => {
    const states = flyManual(manualRoute(), 10, (t) => ({ pitch: 0, roll: t < 0.3 ? 1 : 0, throttle: 0.5 }));
    const atRelease = states[Math.round(0.35 / PHYSICS_DT)] as FlightState;
    expect(deg(atRelease.phi)).toBeGreaterThan(30);
    for (let i = Math.round(0.35 / PHYSICS_DT); i < states.length; i++) {
      expect((states[i] as FlightState).phi).toBeCloseTo(atRelease.phi, 6);
    }
    // And the opposite stick rolls it back, which is how you level out.
    const back = flyManual(manualRoute(), 6, (t) => ({ pitch: 0, roll: t < 0.3 ? 1 : t < 0.6 ? -1 : 0, throttle: 0.5 }));
    expect(Math.abs(deg(last(back).phi))).toBeLessThan(1);
  });

  it("sustained bank flies a coordinated level turn: n = 1/cos(bank), psi rate = g tan(bank)/V", () => {
    // 0.4 s of full roll at 150 deg/s is 60 degrees; then hands off, the bank holds.
    const states = flyManual(manualRoute(), 20, (t) => ({ pitch: 0, roll: t < 0.4 ? 1 : 0, throttle: 0.5 }));
    const a = states[Math.round(10 / PHYSICS_DT)] as FlightState;
    const b = states[Math.round(15 / PHYSICS_DT)] as FlightState;
    expect(deg(b.phi)).toBeCloseTo(60, 3);
    // Bank is acos(1/n), so the load factor is 2 and altitude holds.
    expect(deg(Math.acos(1 / b.g))).toBeCloseTo(60, 1);
    expect(Math.abs(b.pos.y - 2000)).toBeLessThan(10);

    let dpsi = b.psi - a.psi;
    dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
    // Heading change over 5 s can exceed pi, so integrate the expected rate.
    let expected = 0;
    for (let i = Math.round(10 / PHYSICS_DT); i < Math.round(15 / PHYSICS_DT); i++) {
      expected += ((G0 * Math.tan((states[i] as FlightState).phi)) / (states[i] as FlightState).v) * PHYSICS_DT;
    }
    const wrapped = Math.atan2(Math.sin(expected), Math.cos(expected));
    expect(dpsi).toBeCloseTo(wrapped, 1);
  });
});

describe("manual: throttle", () => {
  it("full throttle ends faster than neutral, zero throttle slower, all within limits", () => {
    const fast = flyManual(manualRoute(), 120, () => ({ pitch: 0, roll: 0, throttle: 1 }));
    const slow = flyManual(manualRoute(), 120, () => ({ pitch: 0, roll: 0, throttle: 0 }));
    const vFast = last(fast).v;
    const vSlow = last(slow).v;
    expect(vFast).toBeGreaterThan(260);
    expect(vSlow).toBeLessThan(180);
    expect(vFast).toBeLessThanOrEqual(340);
    expect(vSlow).toBeGreaterThanOrEqual(V_MIN);
  });
});

describe("manual: determinism and fuzz", () => {
  it("same inputs give the same state", () => {
    const inp = (t: number): PilotInput => ({
      pitch: Math.sin(t),
      roll: Math.cos(t * 0.7),
      throttle: 0.5 + 0.4 * Math.sin(t * 0.3),
    });
    const a = flyManual(manualRoute(), 30, inp);
    const b = flyManual(manualRoute(), 30, inp);
    expect(last(a)).toEqual(last(b));
  });

  it.each([1, 2, 3, 4, 5])("seeded random stick for 5 min never goes below ground, over the G cap, or NaN (seed %i)", { timeout: 60000 }, (seed) => {
    const rand = rng(seed);
    const route = manualRoute(rand() < 0.5 ? 400 : 2000, 220);
    let s = initialManualState(route);
    let input: PilotInput = NEUTRAL_INPUT;
    let nextChange = 0;
    let minAlt = Infinity;
    const ticks = Math.round(300 / PHYSICS_DT);
    const violations: string[] = [];
    for (let i = 0; i < ticks; i++) {
      if (s.t >= nextChange) {
        // Mostly extreme inputs: that is where it breaks.
        const pick = () => (rand() < 0.5 ? (rand() < 0.5 ? -1 : 1) : rand() * 2 - 1);
        input = { pitch: pick(), roll: pick(), throttle: rand() };
        nextChange = s.t + 0.2 + rand() * 4;
      }
      s = stepManual(s, input);
      minAlt = Math.min(minAlt, s.pos.y);
      const bad =
        !isFinite(s.pos.x + s.pos.y + s.pos.z + s.v + s.psi + s.gamma + s.phi + s.alpha + s.g) ||
        s.g > PILOT_MAX_G + 1e-9 ||
        (!s.crashed && s.g > maxLoadFactor(s.v) + 1e-9) ||
        s.g < PILOT_MIN_G - 1e-9 ||
        (!s.crashed && s.v < V_MIN) ||
        s.pos.y < 0 ||
        s.finished;
      if (bad && violations.length < 3) violations.push(`t=${s.t.toFixed(2)} ${JSON.stringify(s)}`);
    }
    expect(violations).toEqual([]);
    expect(minAlt).toBeGreaterThanOrEqual(0);
  });
});
