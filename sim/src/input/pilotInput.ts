/**
 * Held keys -> PilotInput, as a pure function so it can be tested without a DOM.
 * Keys are matched on `KeyboardEvent.code` (physical position), not `key`.
 */

import { NEUTRAL_INPUT } from "../flight/types";
import type { PilotInput } from "../flight/types";

/** Full deflection takes 1/AXIS_RATE seconds of holding a key. */
export const AXIS_RATE = 2.5;
/** Stick springs back faster than it is pushed, like a real centring spring. */
export const AXIS_RETURN_RATE = 4;
/** Throttle is slower: it is a lever, not a stick. */
export const THROTTLE_RATE = 0.8;

const PITCH_PULL = ["KeyS", "ArrowDown"];
const PITCH_PUSH = ["KeyW", "ArrowUp"];
const ROLL_RIGHT = ["KeyD", "ArrowRight"];
const ROLL_LEFT = ["KeyA", "ArrowLeft"];
// Ctrl is out: Ctrl+W closes the tab and a page cannot block it.
const THROTTLE_UP = ["ShiftLeft", "ShiftRight", "KeyE"];
const THROTTLE_DOWN = ["KeyQ"];
const RECENTRE = "Space";

/** Keys whose default action (page scroll, browser shortcuts) must be blocked. */
export const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  ...PITCH_PULL, ...PITCH_PUSH, ...ROLL_RIGHT, ...ROLL_LEFT, ...THROTTLE_UP, ...THROTTLE_DOWN, RECENTRE,
]);

const anyHeld = (held: ReadonlySet<string>, codes: string[]) => codes.some((c) => held.has(c));
const dir = (held: ReadonlySet<string>, pos: string[], neg: string[]) =>
  (anyHeld(held, pos) ? 1 : 0) - (anyHeld(held, neg) ? 1 : 0);

/** Move `v` toward `target` by at most `maxDelta`, never overshooting. */
function approach(v: number, target: number, maxDelta: number): number {
  return v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);
}

/** Axis: ramp toward +-1 while a key is held, spring back to `rest` otherwise. */
function axis(v: number, d: number, rest: number, up: number, ret: number, dt: number, lo: number, hi: number) {
  const next = d === 0 ? approach(v, rest, ret * dt) : approach(v, d > 0 ? hi : lo, up * dt);
  return next;
}

export function stepPilotInput(prev: PilotInput, held: ReadonlySet<string>, dt: number): PilotInput {
  if (held.has(RECENTRE)) return NEUTRAL_INPUT;
  // A bad dt must not push an axis past its range or into NaN.
  dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return {
    pitch: axis(prev.pitch, dir(held, PITCH_PULL, PITCH_PUSH), 0, AXIS_RATE, AXIS_RETURN_RATE, dt, -1, 1),
    roll: axis(prev.roll, dir(held, ROLL_RIGHT, ROLL_LEFT), 0, AXIS_RATE, AXIS_RETURN_RATE, dt, -1, 1),
    throttle: axis(prev.throttle, dir(held, THROTTLE_UP, THROTTLE_DOWN), 0.5, THROTTLE_RATE, THROTTLE_RATE, dt, 0, 1),
  };
}
