import { describe, expect, it } from "vitest";
import { initialState } from "../src/flight/dynamics";
import { chaseCamera, CHASE_BACK, CHASE_UP } from "../src/scene/chaseCam";
import type { Route } from "../src/flight/types";

const route = (headingDeg: number): Route => ({
  name: "t",
  start: { altitude: 1500, speed: 200, headingDeg },
  legs: [],
});

describe("chaseCamera", () => {
  it("sits behind (south of) a jet heading north, and above it", () => {
    const s = initialState(route(0));
    const c = chaseCamera(s);
    expect(c.position.x).toBeCloseTo(s.pos.x);
    expect(c.position.z).toBeCloseTo(s.pos.z + CHASE_BACK); // north is -Z, so behind is +Z
    expect(c.position.y).toBeCloseTo(s.pos.y + CHASE_UP);
  });

  it("sits west of a jet heading east", () => {
    const s = initialState(route(90));
    const c = chaseCamera(s);
    expect(c.position.x).toBeCloseTo(s.pos.x - CHASE_BACK);
    expect(c.position.z).toBeCloseTo(s.pos.z);
  });

  it("looks at a point ahead of the jet, not behind it", () => {
    const s = initialState(route(0));
    const c = chaseCamera(s);
    expect(c.lookAt.z).toBeLessThan(s.pos.z); // ahead = north = -Z
  });

  it("stays finite even in a steep dive", () => {
    const s = { ...initialState(route(0)), gamma: -1.4 };
    const c = chaseCamera(s);
    for (const v of [c.position.x, c.position.y, c.position.z, c.lookAt.x, c.lookAt.y, c.lookAt.z]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
