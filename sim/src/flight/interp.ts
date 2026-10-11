/**
 * Render-time interpolation between two physics states.
 *
 * Physics runs in fixed 10 ms steps but frames land at irregular times, so drawing
 * the latest state directly makes the picture advance in uneven jumps (judder).
 * Drawing the point `t` of the way between the previous and current step removes
 * it. Only used for what is DRAWN: the cuff and the HUD numbers read the real state.
 */

import { wrapAngle } from "./dynamics";
import type { FlightState } from "./types";

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpState(a: FlightState, b: FlightState, t: number): FlightState {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    ...b,
    t: mix(a.t, b.t, k),
    pos: { x: mix(a.pos.x, b.pos.x, k), y: mix(a.pos.y, b.pos.y, k), z: mix(a.pos.z, b.pos.z, k) },
    v: mix(a.v, b.v, k),
    // Heading wraps at +-pi, so interpolate the SHORT way round.
    psi: wrapAngle(a.psi + wrapAngle(b.psi - a.psi) * k),
    gamma: mix(a.gamma, b.gamma, k),
    phi: mix(a.phi, b.phi, k),
    alpha: mix(a.alpha, b.alpha, k),
    g: mix(a.g, b.g, k),
  };
}
