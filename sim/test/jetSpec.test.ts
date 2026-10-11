import { describe, expect, it } from "vitest";
import { F35_HEIGHT, F35_LENGTH, F35_SPAN, buildJet, jetBounds } from "../src/scene/jetSpec";
import { Box3, Mesh, Object3D, Vector3 } from "three";

const within = (v: number, real: number, tol: number) => Math.abs(v - real) <= real * tol;

describe("procedural F-35A", () => {
  const size = jetBounds().getSize(new Vector3());

  it("is within 3% of the real length", () => {
    expect(within(size.z, F35_LENGTH, 0.03)).toBe(true);
  });
  it("is within 5% of the real wingspan", () => {
    expect(within(size.x, F35_SPAN, 0.05)).toBe(true);
  });
  it("is within 8% of the real height", () => {
    expect(within(size.y, F35_HEIGHT, 0.08)).toBe(true);
  });
  it("has the nose at the most negative z and the tails aft", () => {
    const jet = buildJet();
    jet.updateMatrixWorld(true);
    const all = new Box3().setFromObject(jet);
    const nose = new Box3().setFromObject(jet.getObjectByName("fuselage") as Object3D);
    expect(nose.min.z).toBeCloseTo(all.min.z, 3);
    expect(all.min.z).toBeLessThan(-F35_LENGTH * 0.45);
    const fins: Mesh[] = [];
    jet.traverse((o) => o.name === "fin" && fins.push(o as Mesh));
    for (const f of fins) expect(new Box3().setFromObject(f).min.z).toBeGreaterThan(0);
  });
  it("stays under the triangle budget", () => {
    let tris = 0;
    buildJet().traverse((o) => {
      const g = (o as Mesh).geometry;
      if (g) tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    });
    expect(tris).toBeLessThan(6000);
  });
});
