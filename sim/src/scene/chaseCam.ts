/**
 * Where the chase camera sits and what it looks at, from the aircraft's state.
 * Pure, so it is testable without a renderer. The camera is placed behind the
 * jet along its HEADING (not its pitch), so a hard pull does not swing the camera
 * under the tail, and a bit above it so the whole jet reads.
 */

import type { FlightState, Vec3 } from "../flight/types";

/** Metres behind the jet (along the ground track) and above it. */
export const CHASE_BACK = 19;
export const CHASE_UP = 5.5;
/** Metres ahead of the jet the camera looks at, so the jet sits low in frame. */
export const CHASE_LOOK_AHEAD = 12;

export interface ChaseCamera {
  position: Vec3;
  lookAt: Vec3;
}

export function chaseCamera(s: FlightState): ChaseCamera {
  // Heading 0 is north, which is -Z in three.js axes; east is +X.
  const fx = Math.sin(s.psi);
  const fz = -Math.cos(s.psi);
  return {
    position: {
      x: s.pos.x - fx * CHASE_BACK,
      y: s.pos.y + CHASE_UP,
      z: s.pos.z - fz * CHASE_BACK,
    },
    lookAt: {
      x: s.pos.x + fx * CHASE_LOOK_AHEAD,
      y: s.pos.y,
      z: s.pos.z + fz * CHASE_LOOK_AHEAD,
    },
  };
}
