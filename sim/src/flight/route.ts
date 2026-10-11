/**
 * The set route.
 *
 * This is the demo sortie: a fixed sequence of maneuvers with fixed G values.
 * Edit it freely - the flight model derives the whole trajectory from these
 * numbers, so changing a `g` here changes both the flight path and what the
 * cuff does, consistently.
 *
 * Two things were kept in mind while picking the numbers:
 *
 *  1. **6 G is the top.** The firmware maps 1 G to an empty cuff and about 6 G
 *     to a full one, so pulling past 6 adds nothing a wearer can feel. The
 *     sortie builds to 6 and stops there.
 *  2. **Energy is real.** A sustained high-G turn bleeds speed, and the wing
 *     cannot make 6 G when slow. Every hard leg is followed by a level leg to
 *     get the speed back, so the route never asks for G it cannot deliver.
 *     `routeFeasibility()` below checks that, and a test asserts it.
 */

import { G_ONSET_RATE, PHYSICS_DT, initialState, routeDuration, step } from "./dynamics";
import { legTargetG } from "./types";
import type { Route } from "./types";

export const DEMO_ROUTE: Route = {
  name: "Range sortie - builds 1 G to 6 G",
  start: {
    altitude: 1500, // m, about 4900 ft
    speed: 220, // m/s, about 430 kt
    headingDeg: 0, // due north
  },
  legs: [
    { kind: "level", seconds: 6, label: "Wings level - cuff at preload, baseline 1 G" },
    { kind: "turn", seconds: 8, g: 2, dir: "right", label: "2 G turn onto the range" },
    { kind: "level", seconds: 4, label: "Roll out" },
    { kind: "turn", seconds: 7, g: 3, dir: "left", label: "3 G turn, reversing" },
    { kind: "level", seconds: 4, label: "Roll out" },
    { kind: "pull", seconds: 1.5, g: 4, label: "Snap 4 G pull" },
    { kind: "push", seconds: 5, g: 0.0, label: "Push over - cuff vents" },
    { kind: "level", seconds: 5, label: "Rebuild speed" },
    { kind: "turn", seconds: 8, g: 4, dir: "right", label: "4 G turn, sustained" },
    { kind: "level", seconds: 5, label: "Unload" },
    { kind: "turn", seconds: 7, g: 5, dir: "left", label: "5 G turn, hard left" },
    { kind: "level", seconds: 5, label: "Unload" },
    { kind: "turn", seconds: 6, g: 6, dir: "right", label: "6 G turn - full squeeze" },
    { kind: "level", seconds: 6, label: "Unload and rebuild" },
    { kind: "pull", seconds: 1.5, g: 6, label: "Snap 6 G - sharpest onset" },
    { kind: "push", seconds: 5, g: 0.0, label: "Unload to vent" },
    { kind: "level", seconds: 14, label: "Rejoin - back to 1 G" },
  ],
};

/**
 * Walk a route and report the worst case: did we ever ask for more G than the
 * wing could make, and how slow did we get?
 *
 * This exists so a route edit cannot quietly produce a sortie where the cuff
 * never reaches the squeeze you scripted. The test suite runs it on DEMO_ROUTE.
 */
export interface Feasibility {
  minSpeed: number;
  /** Legs where the commanded G was not achievable. */
  shortfalls: Array<{ legIndex: number; label: string; commanded: number; achieved: number }>;
  ok: boolean;
}

/** Fly the route in a loop with no rendering and report whether it holds up. */
export function routeFeasibility(route: Route): Feasibility {
  let s = initialState(route);
  let minSpeed = s.v;
  /** Worst achieved G per leg, against what that leg asked for. */
  const worst = new Map<number, { commanded: number; achieved: number }>();

  const maxTicks = Math.ceil(routeDuration(route) / PHYSICS_DT) + 1000;
  for (let i = 0; i < maxTicks && !s.finished; i++) {
    s = step(s, route);
    minSpeed = Math.min(minSpeed, s.v);
    const leg = route.legs[s.legIndex];
    if (!leg) continue;
    const asked = legTargetG(leg);
    // Only judge legs that are actually trying to pull G, and judge the HOLD
    // rather than the onset: G ramps in at a finite rate and a turn has to roll
    // in first, so the opening moment of a 6 G leg is legitimately below 6.
    const settleTime = Math.max(0, (asked - 1) / G_ONSET_RATE) + 0.8;
    if (asked > 1.2 && s.legElapsed > settleTime) {
      const prev = worst.get(s.legIndex);
      if (!prev || s.g < prev.achieved) {
        worst.set(s.legIndex, { commanded: asked, achieved: s.g });
      }
    }
  }

  const shortfalls: Feasibility["shortfalls"] = [];
  for (const [legIndex, { commanded, achieved }] of worst) {
    // 5% slack: the onset ramp and the controller never land exactly on target.
    if (achieved < commanded * 0.95) {
      shortfalls.push({
        legIndex,
        label: route.legs[legIndex]?.label ?? `leg ${legIndex}`,
        commanded,
        achieved,
      });
    }
  }

  return { minSpeed, shortfalls, ok: shortfalls.length === 0 };
}
