import { describe, expect, it } from "vitest";
import { FLAME_MAX_M, FLAME_MIL_M, FLAME_MIN_M, flameLength } from "../src/scene/flame";

describe("flameLength (afterburner plume vs throttle)", () => {
  it("is a short idle plume at zero throttle", () => {
    expect(flameLength(0)).toBeCloseTo(FLAME_MIN_M);
  });
  it("reaches military power at the neutral throttle (0.5) without afterburner", () => {
    expect(flameLength(0.5)).toBeCloseTo(FLAME_MIL_M);
  });
  it("is longest at full throttle", () => {
    expect(flameLength(1)).toBeCloseTo(FLAME_MAX_M);
  });
  it("only ever grows with throttle", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const l = flameLength(t);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
  it("clamps out-of-range and non-finite throttle", () => {
    expect(flameLength(-3)).toBeCloseTo(FLAME_MIN_M);
    expect(flameLength(9)).toBeCloseTo(FLAME_MAX_M);
    expect(flameLength(NaN)).toBeCloseTo(FLAME_MIN_M);
  });
  it("afterburner climbs faster than the dry range (a real step up in length)", () => {
    expect(FLAME_MAX_M - FLAME_MIL_M).toBeGreaterThan(FLAME_MIL_M - FLAME_MIN_M);
  });
});
