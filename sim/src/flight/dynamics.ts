/**
 * Flight model: a 3-DOF point-mass aircraft in coordinated flight.
 *
 * The important design choice: **load factor is the input.** The route says
 * "pull 6 G for four seconds" and the trajectory falls out of that, rather than
 * us flying a shape and measuring whatever G happens to appear. That is what
 * makes "a set route at a set amount of G" exact.
 *
 * The equations are the standard point-mass set for coordinated flight (no
 * sideslip), with n = load factor and phi = bank:
 *
 *   gamma_dot = (g0 / V) * (n * cos(phi) - cos(gamma))
 *   psi_dot   = (g0 * n * sin(phi)) / (V * cos(gamma))
 *   V_dot     = thrust - drag - g0 * sin(gamma)
 *
 * A useful sanity check that falls straight out of the first equation: in a
 * level turn (gamma = 0, gamma_dot = 0) you need n * cos(phi) = 1, so the bank
 * for a given load factor is acos(1/n) - 60 degrees at 2 G. The tests assert it.
 *
 * Physics runs at a FIXED 100 Hz regardless of frame rate, so the same route
 * always produces the same flight. A demo you cannot reproduce is not a demo.
 */

import type { FlightState, Maneuver, PilotInput, Route, Vec3 } from "./types";

/** Standard gravity, m/s^2. */
export const G0 = 9.80665;

/** Physics tick. Fixed, so the route is reproducible. */
export const PHYSICS_DT = 1 / 100;

// --- aircraft, roughly a light fighter --------------------------------------
/** 1 G stall speed, m/s. Max lift goes as (V / V_STALL)^2. */
const V_STALL = 60;
/** Never let the model stop flying. */
const V_MIN = V_STALL;
const V_MAX = 340;
/** Speed the drag constants are referenced to, m/s. */
const V_REF = 180;
/**
 * Full-throttle thrust as an acceleration, m/s^2. About 0.9 g, which is the
 * thrust-to-weight of a light fighter in afterburner - and it has to be roughly
 * that, because sustaining 6 G means out-thrusting the induced drag of a 6 G
 * turn. With less, the route asks for G the wing cannot deliver, which is what
 * `routeFeasibility()` and its test exist to catch.
 */
const THRUST_MAX = 9.0;
/** Throttle at the target speed, before the autothrottle corrects. */
const THROTTLE_IDLE = 0.2;
/** Extra throttle per m/s of speed shortfall. */
const THROTTLE_GAIN = 0.03;
/** Parasite drag at V_REF, m/s^2. Grows with V^2. */
const CD0_ACCEL = 0.9;
/** Induced drag at V_REF and 1 G, m/s^2. Grows with n^2 and falls with V^2. */
const INDUCED_ACCEL = 0.28;
/** Angle of attack at the 1 G stall, rad. Used to place the nose. */
const ALPHA_STALL = 0.26;
/** Structural limit. The cuff never sees more than this. */
export const N_STRUCTURAL_MAX = 10;
/** The most negative G we will model. */
export const N_STRUCTURAL_MIN = -3;

// --- how fast the pilot can change things ----------------------------------
/** Onset rate, G per second. A real pull is not a step change. */
export const G_ONSET_RATE = 4.0;
/**
 * Slower build-up when a person is flying, G per second. A judge holding W would
 * otherwise take the cuff from empty to full in about a second. G still comes OFF
 * at G_ONSET_RATE (deflating is the safe direction), and the safety overrides
 * (ground-avoid, stall, ceiling) keep the full rate so recovery is never slowed.
 */
export const MANUAL_ONSET_RATE = 2.0;
/** Roll rate, rad/s. */
const ROLL_RATE = (150 * Math.PI) / 180;
/** Gain for the "hold me level" controller, 1/s. */
const GAMMA_HOLD_GAIN = 0.6;
/** Flight path angle commanded per metre of altitude error, rad/m. */
const ALT_HOLD_GAIN = 0.0015;
/** Never ask for more than this climb/dive angle just to regain altitude, rad. */
const MAX_HOLD_GAMMA = (12 * Math.PI) / 180;
/**
 * Bounds on what a "level" leg may ask for. Without these the altitude-hold
 * controller recovers from a steep climb by yanking the stick forward: it was
 * commanding the full -3 G structural limit, which is both unflyable and an
 * awful thing to send to a cuff. A pilot rejoins by unloading to about zero and
 * letting gravity bring the nose down, so that is the floor.
 */
const LEVEL_G_MIN = -0.2;
const LEVEL_G_MAX = 3.0;

/** Largest load factor the wing can actually produce at this speed. */
export function maxLoadFactor(v: number): number {
  const lift = (v / V_STALL) ** 2;
  return Math.min(N_STRUCTURAL_MAX, lift);
}

/** Angle of attack needed for load factor n at speed v. */
function angleOfAttack(n: number, v: number): number {
  const alpha = ALPHA_STALL * n * (V_STALL / Math.max(v, V_MIN)) ** 2;
  return clamp(alpha, -ALPHA_STALL, ALPHA_STALL);
}

/**
 * Autothrottle. A pilot does not hold one throttle setting through a sortie:
 * they push it up when energy bleeds off in a turn and pull it back when fast.
 * Modelling that is what makes the hard legs recoverable.
 */
function thrustAccel(v: number, targetSpeed: number): number {
  const throttle = clamp(THROTTLE_IDLE + (targetSpeed - v) * THROTTLE_GAIN, 0, 1);
  return THRUST_MAX * throttle;
}

/** Deceleration from drag, m/s^2, at speed v pulling n. */
function dragAccel(n: number, v: number): number {
  const parasite = CD0_ACCEL * (v / V_REF) ** 2;
  const induced = INDUCED_ACCEL * n * n * (V_REF / Math.max(v, V_MIN)) ** 2;
  return parasite + induced;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Bank angle that sustains load factor n in a level turn: acos(1/n). */
export function bankForLevelTurn(n: number): number {
  if (n <= 1) return 0;
  return Math.acos(1 / n);
}

/** What the current leg is asking of the aeroplane, before any limits. */
interface Command {
  /** Load factor the pilot is asking for. */
  n: number;
  /** Bank angle the pilot is rolling towards, rad. */
  phi: number;
}

function commandFor(leg: Maneuver, s: FlightState, targetAltitude: number): Command {
  switch (leg.kind) {
    case "level": {
      // Fly back to the route's altitude rather than just freezing the flight
      // path angle. Without this, every pull leaves the aeroplane a bit higher
      // and the sortie slowly climbs away instead of looping cleanly.
      const altError = targetAltitude - s.pos.y;
      const targetGamma = clamp(altError * ALT_HOLD_GAIN, -MAX_HOLD_GAMMA, MAX_HOLD_GAMMA);
      const correction = (GAMMA_HOLD_GAIN * (targetGamma - s.gamma) * s.v) / G0;
      const n = Math.cos(s.gamma) + correction;
      return { n: clamp(n, LEVEL_G_MIN, LEVEL_G_MAX), phi: 0 };
    }
    case "pull":
    case "push":
      return { n: leg.g, phi: 0 };
    case "turn": {
      // Hold the commanded load factor EXACTLY - "a set amount of G" is the whole
      // point, so n is never traded away - and use bank to fly the flight path.
      // That is how a level turn is really flown, and it is what the algebra
      // wants: rearranging gamma_dot = (g0/V)(n cos phi - cos gamma) for the bank
      // that produces a chosen gamma_dot gives
      //     cos phi = (cos gamma + (V/g0) * gamma_dot) / n.
      // With gamma = 0 and gamma_dot = 0 this collapses to acos(1/n), the textbook
      // level-turn bank, which `bankForLevelTurn` still states on its own.
      //
      // Without this correction the roll-in transient leaves a residual flight
      // path angle of a fraction of a degree that nothing ever nulls, and the
      // aeroplane climbs steadily through the whole turn.
      const altError = targetAltitude - s.pos.y;
      const targetGamma = clamp(altError * ALT_HOLD_GAIN, -MAX_HOLD_GAMMA, MAX_HOLD_GAMMA);
      const desiredGammaDot = GAMMA_HOLD_GAIN * (targetGamma - s.gamma);
      const cosPhi = (Math.cos(s.gamma) + (s.v * desiredGammaDot) / G0) / leg.g;
      const bank = Math.acos(clamp(cosPhi, -1, 1));
      return { n: leg.g, phi: leg.dir === "left" ? -bank : bank };
    }
    case "rollTo": {
      const phi = (leg.bankDeg * Math.PI) / 180;
      // Keep the flight path while rolled: n * cos(phi) = cos(gamma).
      const n = Math.cos(s.gamma) / Math.max(Math.cos(phi), 0.2);
      return { n, phi };
    }
  }
}

/** Move a value towards a target, no faster than `rate` per second. */
function approach(current: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (target > current) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

export function initialState(route: Route): FlightState {
  const psi = (route.start.headingDeg * Math.PI) / 180;
  return {
    t: 0,
    pos: { x: 0, y: route.start.altitude, z: 0 },
    v: route.start.speed,
    psi,
    gamma: 0,
    phi: 0,
    alpha: angleOfAttack(1, route.start.speed),
    g: 1,
    gCommanded: 1,
    gLimited: false,
    distance: 0,
    legIndex: 0,
    legElapsed: 0,
    finished: false,
  };
}

/** The part of a tick that does not depend on whether a route or a pilot is flying. */
type CoreState = Omit<FlightState, "legIndex" | "legElapsed" | "finished">;

/**
 * One tick of the point-mass equations, shared by the scripted route and the
 * manual stick so the two cannot drift apart. `cmd` is the load factor and bank
 * being asked for; this applies onset rate, wing limit and speed limits.
 */
function integrate(
  s: FlightState,
  cmd: Command,
  targetSpeed: number,
  dt: number,
  onsetUp: number = G_ONSET_RATE,
): CoreState {
  // 1. The pilot cannot snap to a load factor, and the wing has a limit.
  const commanded = clamp(cmd.n, N_STRUCTURAL_MIN, N_STRUCTURAL_MAX);
  const available = maxLoadFactor(s.v);
  const reachable = clamp(commanded, N_STRUCTURAL_MIN, available);
  const n = approach(s.g, reachable, reachable > s.g ? onsetUp : G_ONSET_RATE, dt);
  const phi = approach(s.phi, cmd.phi, ROLL_RATE, dt);

  // 2. Point-mass equations of motion.
  const v = Math.max(s.v, V_MIN);
  const cosGamma = Math.cos(s.gamma);

  // Pulling G costs speed, and a slower wing can make less G. Evaluate the speed
  // first, then re-apply the lift limit at the speed we are about to report, so
  // the G we hand the cuff is never more than the wing could make at that speed.
  // One correction pass is plenty: the change is tiny but it keeps the invariant
  // exactly true, and this number drives a pump on someone's leg.
  const vGuess = clamp(
    s.v + (thrustAccel(v, targetSpeed) - dragAccel(n, v) - G0 * Math.sin(s.gamma)) * dt,
    V_MIN,
    V_MAX,
  );
  const nFinal = clamp(n, N_STRUCTURAL_MIN, maxLoadFactor(vGuess));

  const gammaDot = (G0 / v) * (nFinal * Math.cos(phi) - cosGamma);
  // cos(gamma) in the denominator blows up pointing straight up, so floor it.
  const psiDot = (G0 * nFinal * Math.sin(phi)) / (v * Math.max(cosGamma, 0.2));
  const vDot = thrustAccel(v, targetSpeed) - dragAccel(nFinal, v) - G0 * Math.sin(s.gamma);

  let gamma = s.gamma + gammaDot * dt;
  gamma = clamp(gamma, (-89 * Math.PI) / 180, (89 * Math.PI) / 180);
  const psi = wrapAngle(s.psi + psiDot * dt);
  const vNext = clamp(s.v + vDot * dt, V_MIN, V_MAX);

  // 3. Position. Heading 0 is north, which is -Z in three.js axes.
  const horizontal = vNext * Math.cos(gamma);
  const vel: Vec3 = {
    x: horizontal * Math.sin(psi),
    y: vNext * Math.sin(gamma),
    z: -horizontal * Math.cos(psi),
  };
  const pos: Vec3 = {
    x: s.pos.x + vel.x * dt,
    y: Math.max(0, s.pos.y + vel.y * dt),
    z: s.pos.z + vel.z * dt,
  };

  return {
    t: s.t + dt,
    pos,
    v: vNext,
    psi,
    gamma,
    phi,
    alpha: angleOfAttack(nFinal, vNext),
    g: nFinal,
    gCommanded: commanded,
    // Only call it limited when the wing is the reason, not the onset rate.
    gLimited: commanded > Math.min(available, maxLoadFactor(vNext)) + 1e-6,
    distance: s.distance + vNext * dt,
  };
}

/**
 * Advance the aircraft by exactly one physics tick.
 *
 * Pure: same input, same output. That is what the tests lean on, and what makes
 * the route reproducible on stage.
 */
export function step(s: FlightState, route: Route, dt: number = PHYSICS_DT): FlightState {
  const leg = route.legs[s.legIndex];
  if (!leg) return { ...s, finished: true, g: 1 };

  const core = integrate(s, commandFor(leg, s, route.start.altitude), route.start.speed, dt);

  // 4. Route bookkeeping.
  const legElapsed = s.legElapsed + dt;
  const legDone = legElapsed >= leg.seconds;
  const legIndex = legDone ? s.legIndex + 1 : s.legIndex;

  return {
    ...core,
    legIndex,
    legElapsed: legDone ? 0 : legElapsed,
    finished: legIndex >= route.legs.length,
  };
}

// --- manual flight ----------------------------------------------------------
/** Highest load factor the pilot can ask for. Full pull in level flight gets here. */
export const PILOT_MAX_G = 10;
/** Most negative load factor the pilot can ask for. */
export const PILOT_MIN_G = -1.5;
/** Speed that throttle 0.5 holds. Route-independent, unlike the scripted sorties. */
const MANUAL_SPEED = 220;
/** Max bank from full roll input, rad. Short of 90 so 1/cos(bank) stays sane. */
const MANUAL_MAX_BANK = (80 * Math.PI) / 180;
/** Load factor per unit of stick, so full pull from trim (1 G) reaches PILOT_MAX_G. */
const PITCH_GAIN = PILOT_MAX_G - 1;
/** Floor on cos(bank) in the trim, same reason as the rollTo leg. */
const MIN_COS_BANK = 0.2;

/** Below this speed with the nose up, push over before the wing runs out of lift. */
const STALL_PROTECT_SPEED = V_STALL * 1.3;
/** G taken off the 1 G trim to drop the nose when protecting against a stall. */
const STALL_PUSH_G = 0.6;
/** Soft ceiling, m. Above it the aircraft is pushed back down. */
const CEILING = 12000;
/** Seconds of climb rate counted towards the ceiling check. */
const CEILING_LOOKAHEAD = 5;

export function initialManualState(route: Route): FlightState {
  return initialState(route);
}

/** Speed target for throttle 0..1, spanning V_MIN..V_MAX with 0.5 at MANUAL_SPEED. */
function manualSpeedTarget(throttle: number): number {
  const t = clamp(throttle, 0, 1) - 0.5;
  return MANUAL_SPEED + 2 * t * (t > 0 ? V_MAX - MANUAL_SPEED : MANUAL_SPEED - V_MIN);
}

/** Load factor that nulls gamma error towards `targetGamma`, as the level leg does. */
function holdGammaN(s: FlightState, targetGamma: number): number {
  return Math.cos(s.gamma) + (GAMMA_HOLD_GAIN * (targetGamma - s.gamma) * s.v) / G0;
}

/**
 * Advance one tick under pilot control. Same equations as `step`; only where the
 * command comes from differs. Safety overrides run on top of the stick: the
 * aircraft is held below the ceiling and pushed over before a stall. It CAN be
 * flown into the ground: that is a crash, which freezes it (see below).
 */
export function stepManual(
  s: FlightState,
  input: PilotInput,
  dt: number = PHYSICS_DT,
): FlightState {
  // A crash is final: nothing moves until the sim is restarted.
  if (s.crashed) return s;

  // Roll is a RATE command: the stick rolls the aircraft and the bank stays where
  // it was left when the stick centres (no automatic return to wings level).
  const phiTarget = clamp(s.phi + clamp(input.roll, -1, 1) * ROLL_RATE * dt, -MANUAL_MAX_BANK, MANUAL_MAX_BANK);
  // Trim for the bank we will have after this tick, so a held bank holds altitude.
  const phi = approach(s.phi, phiTarget, ROLL_RATE, dt);
  const trim = Math.cos(s.gamma) / Math.max(Math.cos(phi), MIN_COS_BANK);
  let n = trim + clamp(input.pitch, -1, 1) * PITCH_GAIN;

  const stalling = s.v < STALL_PROTECT_SPEED && s.gamma > 0;
  if (stalling) n = Math.min(n, trim - STALL_PUSH_G);
  // Look ahead by the climb rate: a zoom climb coasts a long way past the ceiling.
  const altAhead = s.pos.y + Math.max(s.v * Math.sin(s.gamma), 0) * CEILING_LOOKAHEAD;
  if (altAhead > CEILING) {
    const targetGamma = clamp((CEILING - altAhead) * ALT_HOLD_GAIN, -MAX_HOLD_GAMMA, 0);
    n = Math.min(n, holdGammaN(s, targetGamma));
  }

  const cmd = { n: clamp(n, PILOT_MIN_G, PILOT_MAX_G), phi: phiTarget };
  // Overrides recover at full rate; only the pilot's own pull is slowed.
  const onsetUp = stalling || altAhead > CEILING ? G_ONSET_RATE : MANUAL_ONSET_RATE;
  // Mode switching is handled elsewhere: keep the route bookkeeping as handed in.
  const next: FlightState = {
    ...integrate(s, cmd, manualSpeedTarget(input.throttle), dt, onsetUp),
    legIndex: s.legIndex,
    legElapsed: s.legElapsed,
    finished: false,
  };
  // Touching the ground is a crash. It also drops G to 1, so an impact can never
  // reach the cuff as a spike: the person on the other end feels the baseline.
  if (next.pos.y <= 0) {
    return { ...next, pos: { ...next.pos, y: 0 }, v: 0, g: 1, gCommanded: 1, gLimited: false, crashed: true };
  }
  return next;
}

/**
 * The same flight with the G dropped to 1. Used whenever the cuff has been told
 * 1 G (paused, link killed, panic vent) while the sim kept its old G: without it,
 * the moment the live value is posted again the cuff jumps from empty to that G.
 */
export function calmed(s: FlightState): FlightState {
  return { ...s, g: 1, gCommanded: 1, gLimited: false };
}

/** Keep an angle in [-pi, pi). */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/** Total scheduled length of a route, seconds. */
export function routeDuration(route: Route): number {
  return route.legs.reduce((sum, l) => sum + l.seconds, 0);
}
