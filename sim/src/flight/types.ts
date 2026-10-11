/**
 * Shared types for the flight model.
 *
 * Everything here is SI: metres, metres per second, radians, seconds.
 * Angles only become degrees at the edges, in the HUD.
 *
 * Axes follow three.js so the renderer needs no conversion:
 *   +X = east, +Y = up (altitude), -Z = north.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One instant of the aircraft's state. */
export interface FlightState {
  /** Seconds since the route started. */
  t: number;
  /** Position in metres. y is altitude above sea level. */
  pos: Vec3;
  /** True airspeed, m/s. */
  v: number;
  /** Heading, rad. 0 = north, increasing eastward. */
  psi: number;
  /** Flight path angle, rad. Positive = climbing. */
  gamma: number;
  /** Bank angle, rad. Positive = right wing down. */
  phi: number;
  /**
   * Angle of attack, rad. The nose sits this far above the flight path, which
   * is why the horizon drops during a hard pull even before you climb.
   */
  alpha: number;
  /**
   * Normal load factor we are ACTUALLY pulling - what the pilot feels and what
   * we send to the cuff. 1.0 in level flight.
   */
  g: number;
  /** What the route asked for, before the wing's limits were applied. */
  gCommanded: number;
  /** True when the wing could not deliver gCommanded (too slow). */
  gLimited: boolean;
  /** Metres flown along the route, for the progress readout. */
  distance: number;
  /** Index of the maneuver being flown. */
  legIndex: number;
  /** Seconds spent in the current maneuver. */
  legElapsed: number;
  /** True once the whole route has been flown. */
  finished: boolean;
  /** True once the aircraft has hit the ground. Frozen from then on; restart to fly again. */
  crashed?: boolean;
}

/**
 * One leg of the route. The G value is the INPUT, not a result: the trajectory
 * is derived from it, so "a set amount of G" is exact rather than approximate.
 */
export type Maneuver =
  /** Hold altitude and wings level. */
  | { kind: "level"; seconds: number; label: string }
  /** Wings-level pull. g > 1 raises the nose. */
  | { kind: "pull"; seconds: number; g: number; label: string }
  /** Wings-level push. g < 1 (and may go negative) lowers the nose. */
  | { kind: "push"; seconds: number; g: number; label: string }
  /**
   * Coordinated level turn at a sustained load factor. The bank angle needed is
   * derived from g (bank = acos(1/g)), which is what makes the turn hold
   * altitude exactly.
   */
  | { kind: "turn"; seconds: number; g: number; dir: "left" | "right"; label: string }
  /** Roll to a bank angle while holding the flight path. */
  | { kind: "rollTo"; seconds: number; bankDeg: number; label: string };

export interface Route {
  name: string;
  /** Where and how the sortie starts. */
  start: {
    altitude: number;
    speed: number;
    headingDeg: number;
  };
  legs: Maneuver[];
}

/** The G a leg is asking for, or 1 for legs that have no G of their own. */
export function legTargetG(m: Maneuver): number {
  switch (m.kind) {
    case "pull":
    case "push":
    case "turn":
      return m.g;
    default:
      return 1;
  }
}

/**
 * Pilot stick/throttle, each axis already normalised. The input layer produces
 * this; the physics consumes it. Neutral (all zeros) must mean "hold level".
 */
export interface PilotInput {
  /** -1 (push) .. +1 (pull). Sets load factor OFFSET from level-flight trim. */
  pitch: number;
  /** -1 (left) .. +1 (right). Sets target bank angle. */
  roll: number;
  /** 0 .. 1 throttle trim demand. 0.5 = hold the speed target. */
  throttle: number;
}

export const NEUTRAL_INPUT: PilotInput = { pitch: 0, roll: 0, throttle: 0.5 };

/** manual = player flies; auto = the scripted DEMO_ROUTE autopilot. */
export type FlightMode = "manual" | "auto";
