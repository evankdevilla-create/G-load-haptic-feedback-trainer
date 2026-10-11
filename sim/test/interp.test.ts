import { describe, expect, it } from "vitest";
import { initialState } from "../src/flight/dynamics";
import { lerpState } from "../src/flight/interp";
import type { FlightState, Route } from "../src/flight/types";

const route: Route = { name: "t", start: { altitude: 1500, speed: 200, headingDeg: 0 }, legs: [] };
const base = (): FlightState => initialState(route);

describe("lerpState (render interpolation between physics steps)", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    const a = { ...base(), pos: { x: 0, y: 1000, z: 0 }, v: 100, g: 1 };
    const b = { ...base(), pos: { x: 10, y: 1020, z: -30 }, v: 110, g: 3 };
    expect(lerpState(a, b, 0).pos).toEqual(a.pos);
    expect(lerpState(a, b, 1).pos).toEqual(b.pos);
  });

  it("is linear in position, speed and G at t=0.5", () => {
    const a = { ...base(), pos: { x: 0, y: 1000, z: 0 }, v: 100, g: 1 };
    const b = { ...base(), pos: { x: 10, y: 1020, z: -30 }, v: 110, g: 3 };
    const m = lerpState(a, b, 0.5);
    expect(m.pos).toEqual({ x: 5, y: 1010, z: -15 });
    expect(m.v).toBeCloseTo(105);
    expect(m.g).toBeCloseTo(2);
  });

  it("takes the short way round for heading across north (359 deg -> 1 deg)", () => {
    const a = { ...base(), psi: (-1 * Math.PI) / 180 };
    const b = { ...base(), psi: (1 * Math.PI) / 180 };
    expect(lerpState(a, b, 0.5).psi).toBeCloseTo(0);
    const c = { ...base(), psi: Math.PI - 0.01 };
    const d = { ...base(), psi: -Math.PI + 0.01 };
    expect(Math.abs(lerpState(c, d, 0.5).psi)).toBeGreaterThan(Math.PI - 0.02);
  });

  it("clamps t and takes everything non-continuous from the newer state", () => {
    const a = { ...base(), legIndex: 1, finished: false };
    const b = { ...base(), legIndex: 2, finished: true };
    const m = lerpState(a, b, 5);
    expect(m.legIndex).toBe(2);
    expect(m.finished).toBe(true);
    expect(lerpState(a, b, -3).pos).toEqual(a.pos);
  });
});
