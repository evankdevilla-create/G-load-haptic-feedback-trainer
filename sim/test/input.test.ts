import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT } from "../src/flight/types";
import type { PilotInput } from "../src/flight/types";
import { AXIS_RATE, AXIS_RETURN_RATE, PREVENT_DEFAULT_CODES, stepPilotInput } from "../src/input/pilotInput";

const keys = (...c: string[]) => new Set(c);
const run = (start: PilotInput, held: Set<string>, seconds: number, dt = 0.01): PilotInput => {
  let p = start;
  for (let i = 0; i < Math.round(seconds / dt); i++) p = stepPilotInput(p, held, dt);
  return p;
};

describe("stepPilotInput", () => {
  it("stays neutral with nothing held", () => {
    expect(run(NEUTRAL_INPUT, keys(), 1)).toEqual(NEUTRAL_INPUT);
  });

  it("ramps pitch up gradually, not instantly, when pulling", () => {
    const p = stepPilotInput(NEUTRAL_INPUT, keys("KeyS"), 0.01);
    expect(p.pitch).toBeCloseTo(AXIS_RATE * 0.01);
    expect(p.pitch).toBeLessThan(0.5);
  });

  it("saturates at +1 / -1", () => {
    expect(run(NEUTRAL_INPUT, keys("ArrowDown"), 5).pitch).toBe(1);
    expect(run(NEUTRAL_INPUT, keys("KeyW"), 5).pitch).toBe(-1);
    expect(run(NEUTRAL_INPUT, keys("KeyD"), 5).roll).toBe(1);
    expect(run(NEUTRAL_INPUT, keys("ArrowLeft"), 5).roll).toBe(-1);
  });

  it("cancels opposite keys", () => {
    const p = run(NEUTRAL_INPUT, keys("KeyS", "KeyW", "KeyA", "KeyD"), 2);
    expect(p.pitch).toBe(0);
    expect(p.roll).toBe(0);
  });

  it("returns to 0 on release at a finite rate", () => {
    const pulled = run(NEUTRAL_INPUT, keys("KeyS"), 5);
    const soon = stepPilotInput(pulled, keys(), 0.01);
    expect(soon.pitch).toBeCloseTo(1 - AXIS_RETURN_RATE * 0.01);
    expect(run(pulled, keys(), 5).pitch).toBe(0);
  });

  it("E also throttles up, and Ctrl does nothing (Ctrl+W closes the tab)", () => {
    expect(run(NEUTRAL_INPUT, keys("KeyE"), 5).throttle).toBe(1);
    expect(run(NEUTRAL_INPUT, keys("ControlLeft", "ControlRight"), 5).throttle).toBe(0.5);
  });

  it("a bad dt cannot push an axis out of range or to NaN", () => {
    for (const dt of [NaN, -1, Infinity]) {
      const p = stepPilotInput(NEUTRAL_INPUT, keys("KeyS", "KeyD", "KeyE"), dt);
      expect(Number.isFinite(p.pitch + p.roll + p.throttle)).toBe(true);
      expect(Math.abs(p.pitch)).toBeLessThanOrEqual(1);
    }
  });

  it("does not overshoot zero when returning", () => {
    const p = stepPilotInput({ ...NEUTRAL_INPUT, roll: -0.001 }, keys(), 0.5);
    expect(p.roll).toBe(0);
  });

  it("throttle ramps up/down around 0.5 and returns to 0.5", () => {
    const up = run(NEUTRAL_INPUT, keys("ShiftLeft"), 5);
    expect(up.throttle).toBe(1);
    const down = run(NEUTRAL_INPUT, keys("KeyQ"), 5);
    expect(down.throttle).toBe(0);
    expect(run(up, keys(), 10).throttle).toBe(0.5);
    expect(run(down, keys(), 10).throttle).toBe(0.5);
    expect(run(NEUTRAL_INPUT, keys("ShiftRight", "KeyQ"), 2).throttle).toBe(0.5);
  });

  it("Space recentres instantly, even with stick keys held", () => {
    const deflected = run(NEUTRAL_INPUT, keys("KeyS", "KeyD", "ShiftLeft"), 1);
    expect(deflected.pitch).toBeGreaterThan(0);
    expect(stepPilotInput(deflected, keys("Space", "KeyS", "KeyD"), 0.01)).toEqual(NEUTRAL_INPUT);
  });

  it("zero dt changes nothing", () => {
    const p = { pitch: 0.3, roll: -0.2, throttle: 0.7 };
    expect(stepPilotInput(p, keys("KeyS"), 0)).toEqual(p);
  });

  it("claims scroll keys so the page does not move", () => {
    for (const c of ["ArrowUp", "ArrowDown", "Space"]) expect(PREVENT_DEFAULT_CODES.has(c)).toBe(true);
  });
});
