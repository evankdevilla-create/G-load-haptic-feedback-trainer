import { describe, expect, it } from "vitest";
import { G_EMPTY, G_FULL, PRELOAD_FILL, commandedFill, fillLabel } from "../src/cuff/cuffModel";
import { PAUSED_G, gToPost } from "../src/cuff/postPolicy";

describe("commandedFill", () => {
  // The flashed firmware holds a preload at 1 G (preloadMs 25 s of a 30 s inflate),
  // so 1 G is NOT an empty cuff. These constants mirror trainer_logic.h.
  it("holds the firmware's preload at 1 G and is full at 6 G", () => {
    expect(G_EMPTY).toBe(1);
    expect(G_FULL).toBe(6);
    expect(PRELOAD_FILL).toBeCloseTo(25 / 30);
    expect(commandedFill(1)).toBeCloseTo(PRELOAD_FILL);
    expect(commandedFill(6)).toBe(1);
  });
  it("is linear from the preload to full in between", () => {
    expect(commandedFill(3.5)).toBeCloseTo(PRELOAD_FILL + (1 - PRELOAD_FILL) / 2);
  });
  it("clamps outside the range", () => {
    expect(commandedFill(-2)).toBeCloseTo(PRELOAD_FILL);
    expect(commandedFill(0.2)).toBeCloseTo(PRELOAD_FILL);
    expect(commandedFill(9)).toBe(1);
    expect(commandedFill(Infinity)).toBe(1);
    expect(commandedFill(-Infinity)).toBeCloseTo(PRELOAD_FILL);
  });
  it("treats NaN as empty (no data means the dead-man vents it all the way)", () => {
    expect(commandedFill(NaN)).toBe(0);
  });
});

describe("fillLabel", () => {
  it("formats a percentage", () => {
    expect(fillLabel(0.66)).toBe("66%");
    expect(fillLabel(0)).toBe("0%");
    expect(fillLabel(1)).toBe("100%");
  });
  it("clamps and survives NaN", () => {
    expect(fillLabel(2)).toBe("100%");
    expect(fillLabel(-1)).toBe("0%");
    expect(fillLabel(NaN)).toBe("0%");
  });
});

describe("gToPost", () => {
  const live = { running: true, stalled: false, killed: false, panic: false };
  it("passes live G through", () => {
    expect(gToPost(4.2, live)).toBe(4.2);
  });
  it("posts exactly 1.0 when paused", () => {
    expect(gToPost(4.2, { ...live, running: false })).toBe(1.0);
    expect(PAUSED_G).toBe(1.0);
  });
  it("posts exactly 1.0 when stalled", () => {
    expect(gToPost(4.2, { ...live, stalled: true })).toBe(1.0);
  });
  it("posts exactly 1.0 during a panic vent", () => {
    expect(gToPost(5.9, { ...live, panic: true })).toBe(1.0);
  });
  it("never posts when killed, in any combination", () => {
    for (const running of [true, false])
      for (const stalled of [true, false])
        for (const panic of [true, false])
          for (const g of [0, 1, 4.2, 9, NaN])
            expect(gToPost(g, { running, stalled, panic, killed: true })).toBeNull();
  });
});
