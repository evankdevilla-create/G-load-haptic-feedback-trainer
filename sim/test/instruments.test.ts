import { describe, expect, it } from "vitest";
import {
  arcPath,
  makeTicks,
  pitchToPx,
  polar,
  updateHold,
  valueToAngle,
  wrapDeg,
} from "../src/hud/instruments/scale";
import {
  altimeterPointers,
  headingDeg,
  machNumber,
  speedOfSound,
  vviFpm,
} from "../src/hud/instruments/air";

describe("valueToAngle", () => {
  const f = (v: number) => valueToAngle(v, -5, 10, -135, 270);
  it("maps both ends and the middle of the scale", () => {
    expect(f(-5)).toBeCloseTo(-135);
    expect(f(10)).toBeCloseTo(135);
    expect(f(2.5)).toBeCloseTo(0);
  });
  it("puts 1 G at 18 degrees per G", () => {
    expect(f(1)).toBeCloseTo(-135 + 6 * 18);
  });
  it("clamps values outside the range", () => {
    expect(f(-50)).toBeCloseTo(-135);
    expect(f(99)).toBeCloseTo(135);
  });
  it("is safe on NaN and Infinity", () => {
    expect(f(NaN)).toBeCloseTo(-135);
    expect(f(Infinity)).toBeCloseTo(135);
    expect(f(-Infinity)).toBeCloseTo(-135);
  });
});

describe("polar / arcPath", () => {
  it("angle 0 is 12 o'clock and angles go clockwise", () => {
    const top = polar(50, 50, 10, 0);
    expect(top.x).toBeCloseTo(50);
    expect(top.y).toBeCloseTo(40);
    const right = polar(50, 50, 10, 90);
    expect(right.x).toBeCloseTo(60);
    expect(right.y).toBeCloseTo(50);
  });
  it("builds an SVG arc and flags large arcs", () => {
    expect(arcPath(50, 50, 40, -135, 0)).toMatch(/^M [\d.-]+ [\d.-]+ A 40 40 0 0 1 /);
    expect(arcPath(50, 50, 40, -135, 135)).toMatch(/ A 40 40 0 1 1 /);
  });
  it("returns an empty path for a zero-length or non-finite arc", () => {
    expect(arcPath(50, 50, 40, 10, 10)).toBe("");
    expect(arcPath(50, 50, 40, NaN, 10)).toBe("");
  });
});

describe("makeTicks", () => {
  it("makes one tick per G from -5 to 10 with labelled majors", () => {
    const t = makeTicks(-5, 10, 1, 1);
    expect(t).toHaveLength(16);
    expect(t[0]).toMatchObject({ value: -5, major: true, label: "-5" });
    expect(t[15]).toMatchObject({ value: 10, major: true, label: "10" });
  });
  it("marks every Nth tick major and labels only those", () => {
    const t = makeTicks(0, 700, 50, 2);
    expect(t).toHaveLength(15);
    expect(t.filter((x) => x.major).map((x) => x.label)).toEqual(["0", "100", "200", "300", "400", "500", "600", "700"]);
    expect(t[1]?.label).toBeUndefined();
  });
  it("does not drop the last tick to float error", () => {
    expect(makeTicks(0, 1, 0.1, 1)).toHaveLength(11);
  });
  it("returns nothing for a bad step", () => {
    expect(makeTicks(0, 10, 0, 1)).toEqual([]);
    expect(makeTicks(0, 10, NaN, 1)).toEqual([]);
  });
});

describe("updateHold (max / min G since restart)", () => {
  it("tracks the peak and trough", () => {
    let h = updateHold(undefined, 1, 0);
    h = updateHold(h, 6.8, 1);
    h = updateHold(h, 3, 2);
    h = updateHold(h, 0.4, 3);
    expect(h).toMatchObject({ max: 6.8, min: 0.4 });
  });
  it("resets when time goes backwards (restart)", () => {
    let h = updateHold(undefined, 1, 0);
    h = updateHold(h, 7, 30);
    h = updateHold(h, 1, 0);
    expect(h).toMatchObject({ max: 1, min: 1 });
  });
  it("ignores NaN", () => {
    const h = updateHold(updateHold(undefined, 2, 0), NaN, 1);
    expect(h).toMatchObject({ max: 2, min: 2 });
  });
});

describe("pitchToPx / wrapDeg", () => {
  it("moves the ball 1:1 with pitch and clamps at +-90", () => {
    expect(pitchToPx(10, 1.4)).toBeCloseTo(14);
    expect(pitchToPx(500, 1)).toBe(90);
    expect(pitchToPx(NaN, 1)).toBe(0);
  });
  it("wraps heading into 0..360", () => {
    expect(wrapDeg(-90)).toBe(270);
    expect(wrapDeg(360)).toBe(0);
    expect(wrapDeg(725)).toBe(5);
  });
});

describe("ISA speed of sound and Mach", () => {
  it("is 340.3 m/s at sea level", () => {
    expect(speedOfSound(0)).toBeCloseTo(340.3, 0);
  });
  it("is about 295 m/s at 11 km and stays constant above", () => {
    expect(speedOfSound(11000)).toBeCloseTo(295.1, 0);
    expect(speedOfSound(15000)).toBeCloseTo(speedOfSound(11000), 6);
  });
  it("is Mach 1.0 at 340.3 m/s sea level and 295 m/s at 11 km", () => {
    expect(machNumber(340.3, 0)).toBeCloseTo(1, 2);
    expect(machNumber(295.1, 11000)).toBeCloseTo(1, 2);
  });
  it("is safe on NaN and below sea level", () => {
    expect(machNumber(NaN, 0)).toBe(0);
    expect(speedOfSound(-500)).toBeCloseTo(speedOfSound(0), 6);
    expect(speedOfSound(NaN)).toBeCloseTo(speedOfSound(0), 6);
  });
});

describe("vviFpm", () => {
  it("is positive in a climb, negative in a dive, zero in level flight", () => {
    expect(vviFpm(200, 0.1)).toBeGreaterThan(0);
    expect(vviFpm(200, -0.1)).toBeLessThan(0);
    expect(vviFpm(200, 0)).toBe(0);
  });
  it("converts m/s to ft/min", () => {
    // 100 m/s straight up = 19685 ft/min
    expect(vviFpm(100, Math.PI / 2)).toBeCloseTo(100 * 196.85, 0);
  });
  it("is zero on NaN", () => {
    expect(vviFpm(NaN, 0.1)).toBe(0);
  });
});

describe("altimeterPointers", () => {
  it("one revolution of the main needle is 1000 ft", () => {
    expect(altimeterPointers(0).hundreds).toBeCloseTo(0);
    expect(altimeterPointers(250).hundreds).toBeCloseTo(90);
    expect(altimeterPointers(1000).hundreds).toBeCloseTo(0);
  });
  it("one revolution of the thousands pointer is 10000 ft", () => {
    expect(altimeterPointers(5000).thousands).toBeCloseTo(180);
    expect(altimeterPointers(12500).thousands).toBeCloseTo(90);
  });
  it("clamps negative and NaN to zero", () => {
    expect(altimeterPointers(-300).hundreds).toBeCloseTo(0);
    expect(altimeterPointers(NaN).thousands).toBeCloseTo(0);
  });
});

describe("headingDeg", () => {
  it("converts radians to 0..359 degrees", () => {
    expect(headingDeg(0)).toBe(0);
    expect(headingDeg(Math.PI / 2)).toBe(90);
    expect(headingDeg(-Math.PI / 2)).toBe(270);
    expect(headingDeg(2 * Math.PI)).toBe(0);
  });
});
