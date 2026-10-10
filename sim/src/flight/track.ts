/**
 * Pre-flies the route with no rendering, to get the shape of it.
 *
 * Because the physics is deterministic this is not an approximation of what the
 * aeroplane will do - it is exactly what it will do. That is what lets the HUD
 * draw the whole ground track and the whole G profile up front, with a playhead
 * running along them.
 */

import { PHYSICS_DT, initialState, routeDuration, step } from "./dynamics";
import type { Route } from "./types";

export interface TrackPoint {
  t: number;
  x: number;
  z: number;
  altitude: number;
  g: number;
}

export interface Track {
  points: TrackPoint[];
  duration: number;
  peakG: number;
  minG: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Fly the route once. `everyNth` thins the output; 10 gives a point per 0.1 s. */
export function flyTrack(route: Route, everyNth = 10): Track {
  let s = initialState(route);
  const points: TrackPoint[] = [];
  const total = Math.ceil(routeDuration(route) / PHYSICS_DT);

  let peakG = s.g;
  let minG = s.g;
  let minX = 0;
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;

  for (let i = 0; i < total && !s.finished; i++) {
    s = step(s, route);
    peakG = Math.max(peakG, s.g);
    minG = Math.min(minG, s.g);
    minX = Math.min(minX, s.pos.x);
    maxX = Math.max(maxX, s.pos.x);
    minZ = Math.min(minZ, s.pos.z);
    maxZ = Math.max(maxZ, s.pos.z);
    if (i % everyNth === 0) {
      points.push({ t: s.t, x: s.pos.x, z: s.pos.z, altitude: s.pos.y, g: s.g });
    }
  }

  return {
    points,
    duration: s.t,
    peakG,
    minG,
    bounds: { minX, maxX, minZ, maxZ },
  };
}
