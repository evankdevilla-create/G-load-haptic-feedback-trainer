import { describe, expect, it } from "vitest";
import { CAMERA_FOV_DEG, screenOffsetPx } from "../src/hud/Horizon";

describe("screenOffsetPx (HUD must use the camera's real projection)", () => {
  it("is zero on the view axis", () => {
    expect(screenOffsetPx(0, 720)).toBeCloseTo(0);
  });
  it("puts the edge of the vertical field of view exactly at the screen edge", () => {
    expect(screenOffsetPx(CAMERA_FOV_DEG / 2, 720)).toBeCloseTo(360);
    expect(screenOffsetPx(-CAMERA_FOV_DEG / 2, 1000)).toBeCloseTo(-500);
  });
  it("matches the camera at 10 degrees: tan, not a linear guess", () => {
    const f = 720 / 2 / Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180));
    expect(screenOffsetPx(10, 720)).toBeCloseTo(f * Math.tan((10 * Math.PI) / 180));
  });
});
