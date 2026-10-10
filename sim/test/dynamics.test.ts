/**
 * The flight model drives a pump strapped to someone's leg, so the G it reports
 * has to be right. These tests check it against closed-form aerodynamics rather
 * than against itself.
 */

import { describe, expect, it } from "vitest";
import {
  G0,
  PHYSICS_DT,
  bankForLevelTurn,
  initialState,
  maxLoadFactor,
  N_STRUCTURAL_MAX,
  routeDuration,
  step,
} from "../src/flight/dynamics";
import { DEMO_ROUTE, routeFeasibility } from "../src/flight/route";
import type { FlightState, Maneuver, Route } from "../src/flight/types";

const deg = (rad: number) => (rad * 180) / Math.PI;

/** A one-leg route, so a single maneuver can be studied on its own. */
function soloRoute(leg: Maneuver, altitude = 2000, speed = 220): Route {
  return {
    name: "test",
    start: { altitude, speed, headingDeg: 0 },
    legs: [leg],
  };
}

/** Fly a route for `seconds` and hand back every state along the way. */
function fly(route: Route, seconds: number): FlightState[] {
  let s = initialState(route);
  const out: FlightState[] = [s];
  const ticks = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < ticks; i++) {
    s = step(s, route);
    out.push(s);
  }
  return out;
}

describe("closed-form checks", () => {
  it("bank for a level turn is acos(1/n): 60 degrees at 2 G", () => {
    expect(deg(bankForLevelTurn(2))).toBeCloseTo(60, 6);
    expect(deg(bankForLevelTurn(4))).toBeCloseTo(75.522, 2);
    // At or below 1 G there is no bank that holds altitude.
    expect(bankForLevelTurn(1)).toBe(0);
    expect(bankForLevelTurn(0.5)).toBe(0);
  });

  it("max load factor grows with the square of speed", () => {
    expect(maxLoadFactor(60)).toBeCloseTo(1, 6); // the 1 G stall speed
    expect(maxLoadFactor(120)).toBeCloseTo(4, 6); // double the speed, four times the lift
    expect(maxLoadFactor(1000)).toBe(N_STRUCTURAL_MAX); // structure, not lift, is the limit
  });
});

describe("level flight", () => {
  it("holds altitude and 1 G", () => {
    const states = fly(soloRoute({ kind: "level", seconds: 60, label: "level" }), 40);
    const last = states[states.length - 1]!;
    expect(last.g).toBeCloseTo(1, 1);
    expect(last.pos.y).toBeCloseTo(2000, 0);
    expect(Math.abs(deg(last.gamma))).toBeLessThan(0.5);
  });

  it("flies north, so z decreases and x stays put", () => {
    const states = fly(soloRoute({ kind: "level", seconds: 20, label: "level" }), 10);
    const last = states[states.length - 1]!;
    expect(last.pos.z).toBeLessThan(-2000); // north is -Z
    expect(Math.abs(last.pos.x)).toBeLessThan(1);
  });
});

describe("level turn at a set G", () => {
  const route = soloRoute({ kind: "turn", seconds: 30, g: 2, dir: "right", label: "2 G" });

  it("settles at the commanded 2 G", () => {
    const states = fly(route, 12);
    expect(states[states.length - 1]!.g).toBeCloseTo(2, 2);
  });

  it("banks to 60 degrees, the angle that sustains 2 G", () => {
    const states = fly(route, 12);
    // Within a quarter degree: the altitude trim nudges bank by ~0.07 deg, which
    // is the controller doing its job rather than an error.
    expect(Math.abs(deg(states[states.length - 1]!.phi) - 60)).toBeLessThan(0.25);
  });

  it("holds altitude, trimming bank while G stays exactly on command", () => {
    const states = fly(route, 25);
    const last = states[states.length - 1]!;
    expect(Math.abs(last.pos.y - 2000)).toBeLessThan(5); // metres, over 25 s of turning
    // The point of trimming bank rather than G: the commanded load factor is
    // never traded away to hold altitude.
    expect(last.g).toBeCloseTo(2, 3);
    expect(Math.abs(deg(last.phi) - 60)).toBeLessThan(0.25);
  });

  it("does not creep up or down once settled", () => {
    const states = fly(route, 30);
    const at10 = states[Math.round(10 / PHYSICS_DT)]!.pos.y;
    const at30 = states[Math.round(30 / PHYSICS_DT)]!.pos.y;
    expect(Math.abs(at30 - at10)).toBeLessThan(2); // metres over 20 s
  });

  it("turns at g0*sqrt(n^2-1)/V, the standard rate", () => {
    const states = fly(route, 20);
    // Measure over a late one-second window, once bank and G have settled.
    const a = states[Math.round(15 / PHYSICS_DT)]!;
    const b = states[Math.round(16 / PHYSICS_DT)]!;
    const measured = Math.abs(b.psi - a.psi); // rad/s, no wrap over 1 s
    const expected = (G0 * Math.sqrt(a.g ** 2 - 1)) / a.v;
    expect(measured).toBeCloseTo(expected, 2);
  });

  it("turns the other way when told to", () => {
    const left = soloRoute({ kind: "turn", seconds: 30, g: 2, dir: "left", label: "L" });
    const states = fly(left, 12);
    expect(Math.abs(deg(states[states.length - 1]!.phi) + 60)).toBeLessThan(0.25);
  });
});

describe("pulling and pushing", () => {
  it("a 4 G pull raises the flight path at (g0/V)(n - cos gamma)", () => {
    const route = soloRoute({ kind: "pull", seconds: 10, g: 4, label: "4 G" });
    const states = fly(route, 4);
    const a = states[Math.round(2 / PHYSICS_DT)]!;
    const b = states[Math.round(2 / PHYSICS_DT) + 1]!;
    const measured = (b.gamma - a.gamma) / PHYSICS_DT;
    const expected = (G0 / a.v) * (a.g * Math.cos(a.phi) - Math.cos(a.gamma));
    expect(measured).toBeCloseTo(expected, 3);
    expect(b.gamma).toBeGreaterThan(0); // we are climbing
  });

  it("a push below 1 G lowers the nose and unloads the cuff", () => {
    const route = soloRoute({ kind: "push", seconds: 10, g: 0.2, label: "push" });
    const states = fly(route, 4);
    const last = states[states.length - 1]!;
    expect(last.g).toBeCloseTo(0.2, 2);
    expect(last.gamma).toBeLessThan(0); // nose below the horizon
  });

  it("the nose sits above the flight path under load", () => {
    const hard = fly(soloRoute({ kind: "pull", seconds: 10, g: 6, label: "6 G" }), 2);
    const easy = fly(soloRoute({ kind: "level", seconds: 10, label: "level" }), 2);
    const hardAlpha = hard[hard.length - 1]!.alpha;
    const easyAlpha = easy[easy.length - 1]!.alpha;
    expect(hardAlpha).toBeGreaterThan(easyAlpha);
  });
});

describe("limits that protect the wearer", () => {
  it("G onset is rate limited, never a step change", () => {
    const route = soloRoute({ kind: "pull", seconds: 10, g: 6, label: "6 G" });
    const states = fly(route, 3);
    for (let i = 1; i < states.length; i++) {
      const rate = Math.abs(states[i]!.g - states[i - 1]!.g) / PHYSICS_DT;
      expect(rate).toBeLessThanOrEqual(4.0 + 1e-6); // G per second
    }
  });

  it("never reports more than the structural limit, even if asked", () => {
    const route = soloRoute({ kind: "pull", seconds: 20, g: 50, label: "absurd" });
    for (const s of fly(route, 15)) {
      expect(s.g).toBeLessThanOrEqual(N_STRUCTURAL_MAX + 1e-6);
    }
  });

  it("cannot make 6 G when too slow to do it, and says so", () => {
    // Start near the stall: the wing simply has not got 6 G in it.
    const route = soloRoute({ kind: "pull", seconds: 10, g: 6, label: "6 G" }, 2000, 70);
    const states = fly(route, 3);
    const last = states[states.length - 1]!;
    expect(last.g).toBeLessThan(6);
    expect(last.gLimited).toBe(true);
    expect(last.g).toBeLessThanOrEqual(maxLoadFactor(last.v) + 1e-6);
  });
});

describe("the set route", () => {
  it("asks for no G the aeroplane cannot actually deliver", () => {
    const report = routeFeasibility(DEMO_ROUTE);
    expect(report.shortfalls).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("stays well clear of the stall", () => {
    expect(routeFeasibility(DEMO_ROUTE).minSpeed).toBeGreaterThan(90);
  });

  it("actually reaches 6 G somewhere", () => {
    const states = fly(DEMO_ROUTE, routeDuration(DEMO_ROUTE));
    const peak = Math.max(...states.map((s) => s.g));
    expect(peak).toBeGreaterThan(5.8);
  });

  it("finishes, and finishes at 1 G rather than mid-pull", () => {
    const states = fly(DEMO_ROUTE, routeDuration(DEMO_ROUTE) + 1);
    const last = states[states.length - 1]!;
    expect(last.finished).toBe(true);
    const nearEnd = states[states.length - 60]!;
    expect(nearEnd.g).toBeCloseTo(1, 0);
  });

  it("is reproducible: the same route twice gives the same flight", () => {
    const a = fly(DEMO_ROUTE, 40);
    const b = fly(DEMO_ROUTE, 40);
    const last = (xs: FlightState[]) => xs[xs.length - 1]!;
    expect(last(a).pos).toEqual(last(b).pos);
    expect(last(a).g).toBe(last(b).g);
    expect(last(a).psi).toBe(last(b).psi);
  });

  it("comes back to its starting altitude after the hard legs", () => {
    const states = fly(DEMO_ROUTE, routeDuration(DEMO_ROUTE));
    const last = states[states.length - 1]!;
    expect(Math.abs(last.pos.y - DEMO_ROUTE.start.altitude)).toBeLessThan(400);
  });
});
