import { describe, expect, it } from "vitest";
import {
  CALLOUT_COOLDOWN_MS,
  CALLOUT_TEXT,
  initialCalloutState,
  nextCallout,
} from "../src/voice/callouts";
import type { CalloutId, CalloutState } from "../src/voice/callouts";

/** Feed (g, t) samples through the machine, return what fired and when. */
function run(samples: Array<[number, number]>, running = true, start = initialCalloutState()) {
  let s: CalloutState = start;
  const fired: Array<[number, CalloutId]> = [];
  for (const [g, t] of samples) {
    const r = nextCallout(s, g, t, running);
    s = r.state;
    if (r.callout) fired.push([t, r.callout]);
  }
  return { fired, state: s };
}
const ids = (f: Array<[number, CalloutId]>) => f.map((x) => x[1]);
/** Slow ramp: one sample per second so the cooldown never masks a threshold. */
const ramp = (from: number, to: number, t0: number, step = 0.1) => {
  const out: Array<[number, number]> = [];
  const n = Math.round(Math.abs(to - from) / step);
  for (let i = 0; i <= n; i++) out.push([from + Math.sign(to - from) * step * i, t0 + i * 6000]);
  return out;
};

describe("callouts", () => {
  it("has text for every id", () => {
    for (const id of ["g2", "g4", "g6", "unload", "level", "push"] as CalloutId[]) {
      expect(CALLOUT_TEXT[id].length).toBeGreaterThan(0);
    }
    expect(CALLOUT_TEXT.g6).toBe("Six G.");
  });

  it("fires g2, g4, g6 once each on a slow climb, in order", () => {
    const { fired } = run(ramp(1, 6.5, 0, 0.25));
    expect(ids(fired)).toEqual(["g2", "g4", "g6"]);
  });

  it("does not fire below the threshold", () => {
    expect(run([[1.9, 0], [1.99, 10000]]).fired).toEqual([]);
  });

  it("fires only once while holding above a threshold", () => {
    const s: Array<[number, number]> = [];
    for (let i = 0; i < 50; i++) s.push([2.5, i * 6000]);
    expect(ids(run(s).fired)).toEqual(["g2"]);
  });

  it("re-arms only after dropping 0.5 below the threshold", () => {
    const base = run([[2.1, 0]]);
    // dip to 1.6 (not 0.5 below 2.0), climb again: no refire
    const a = run([[1.6, 6000], [2.1, 12000]], true, base.state);
    expect(a.fired).toEqual([]);
    // dip to 1.4 (>0.5 below), climb again: fires
    const b = run([[1.4, 6000], [2.1, 12000]], true, base.state);
    expect(ids(b.fired)).toEqual(["g2"]);
  });

  it("unload fires dropping below 1.5 after being above 4", () => {
    const { fired } = run([[4.5, 0], [4.5, 1000], [1.4, 6000]]);
    expect(ids(fired)).toEqual(["g4", "unload"]);
  });

  it("unload does not fire without having been above 4", () => {
    expect(ids(run([[3.5, 0], [1.4, 6000]]).fired)).toEqual(["g2"]);
  });

  it("level fires near 1 G after a callout, once", () => {
    const { fired } = run([[2.5, 0], [1.0, 6000], [1.0, 12000], [1.05, 18000]]);
    expect(ids(fired)).toEqual(["g2", "level"]);
  });

  it("level does not fire with no prior callout", () => {
    expect(run([[1.0, 0], [1.0, 6000]]).fired).toEqual([]);
  });

  it("push fires below 0.2 G, re-arms at 0.7", () => {
    const first = run([[0.1, 0]]);
    expect(ids(first.fired)).toEqual(["push"]);
    expect(run([[0.1, 6000]], true, first.state).fired).toEqual([]);
    expect(run([[0.4, 6000], [0.1, 12000]], true, first.state).fired).toEqual([]);
    expect(ids(run([[0.8, 6000], [0.1, 12000]], true, first.state).fired)).toEqual(["level", "push"]);
  });

  it("global cooldown suppresses a second callout inside 5 s", () => {
    const { fired } = run([[2.5, 0], [4.5, 1000]]);
    expect(ids(fired)).toEqual(["g2"]);
    expect(CALLOUT_COOLDOWN_MS).toBe(5000);
  });

  it("a suppressed threshold fires once the cooldown ends, highest only", () => {
    const { fired } = run([[2.5, 0], [6.2, 1000], [6.2, 4999], [6.2, 5000], [6.2, 12000]]);
    expect(fired).toEqual([[0, "g2"], [5000, "g6"]]);
  });

  it("never fires while not running, and leaves state untouched", () => {
    const r = run([[6, 0], [0.1, 6000], [4.5, 12000]], false);
    expect(r.fired).toEqual([]);
    expect(r.state).toEqual(initialCalloutState());
  });

  it("is deterministic", () => {
    const samples: Array<[number, number]> = [];
    for (let i = 0; i < 300; i++) samples.push([3 + 2 * Math.sin(i / 7), i * 100]);
    expect(run(samples)).toEqual(run(samples));
  });

  it("noisy G around 4.0 yields at most one callout", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const samples: Array<[number, number]> = [];
    for (let i = 0; i < 200; i++) samples.push([3.9 + 0.2 * rnd(), i * 100]);
    // start past g2 already consumed so only the 4 G threshold is in play
    const start = run([[2.5, -100000]]).state;
    expect(run(samples, true, start).fired.length).toBeLessThanOrEqual(1);
  });
});
