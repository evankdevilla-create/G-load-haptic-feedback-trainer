/**
 * Spoken G callouts as a pure state machine. The hook feeds it G at ~10 Hz and
 * speaks whatever comes back. Thresholds are hysteretic (re-arm 0.5 G below)
 * and a global cooldown keeps it from talking over itself.
 */

export type CalloutId = "g2" | "g4" | "g6" | "unload" | "level" | "push";

export const CALLOUT_TEXT: Record<CalloutId, string> = {
  g2: "Two G.",
  g4: "Four G.",
  g6: "Six G.",
  unload: "Unloading.",
  level: "Level.",
  push: "Negative G. Easy on the push.",
};

export const CALLOUT_COOLDOWN_MS = 5000;
const REARM_BELOW = 0.5;
const UP_LEVELS = [
  ["g2", 2],
  ["g4", 4],
  ["g6", 6],
] as const;
const HIGH_G = 4;
const UNLOAD_BELOW = 1.5;
const LEVEL_BAND: readonly [number, number] = [0.8, 1.2];
const PUSH_BELOW = 0.2;
const PUSH_REARM = 0.7;

export interface CalloutState {
  /** Threshold crossed up but not yet spoken (or already spoken): true = may fire. */
  armed: { g2: boolean; g4: boolean; g6: boolean; push: boolean };
  /** G has been >= 4 since the last unload callout. */
  wasHigh: boolean;
  /** Something was called out and we haven't announced "level" since. */
  needLevel: boolean;
  lastMs: number | null;
}

export const initialCalloutState = (): CalloutState => ({
  armed: { g2: true, g4: true, g6: true, push: true },
  wasHigh: false,
  needLevel: false,
  lastMs: null,
});

export function nextCallout(
  state: CalloutState,
  g: number,
  nowMs: number,
  running: boolean,
): { state: CalloutState; callout: CalloutId | null } {
  if (!running) return { state, callout: null };

  const armed = { ...state.armed };
  let wasHigh = state.wasHigh || g >= HIGH_G;
  let needLevel = state.needLevel;
  let lastMs = state.lastMs;

  // Re-arm anything G has dropped well clear of.
  for (const [id, t] of UP_LEVELS) if (g < t - REARM_BELOW) armed[id] = true;
  if (g >= PUSH_REARM) armed.push = true;

  // Pending = armed thresholds G is currently past. A pending one stays pending
  // through the cooldown, so a fast pull to 6 G is still announced afterwards.
  const pendingUp = UP_LEVELS.filter(([id, t]) => armed[id] && g >= t);
  let callout: CalloutId | null = null;
  if (armed.push && g < PUSH_BELOW) callout = "push";
  else if (pendingUp.length) callout = pendingUp[pendingUp.length - 1]![0];
  else if (wasHigh && g < UNLOAD_BELOW) callout = "unload";
  else if (needLevel && g >= LEVEL_BAND[0] && g <= LEVEL_BAND[1]) callout = "level";

  const cooled = lastMs === null || nowMs - lastMs >= CALLOUT_COOLDOWN_MS;
  if (callout && cooled) {
    // Speaking the top threshold also consumes the ones below it.
    for (const [id] of pendingUp) armed[id] = false;
    if (callout === "push") armed.push = false;
    if (callout === "unload") wasHigh = false;
    needLevel = callout !== "level";
    lastMs = nowMs;
  } else {
    callout = null;
  }

  return { state: { armed, wasHigh, needLevel, lastMs }, callout };
}
