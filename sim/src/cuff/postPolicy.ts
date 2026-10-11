/** G reported while the sim is paused, stalled or venting. 1 G = preload baseline, not empty (only the dead-man empties it). */
export const PAUSED_G = 1.0;

export interface PostState {
  running: boolean;
  stalled: boolean;
  /** Operator kill: post nothing so the stale rule + firmware dead-man vent. */
  killed: boolean;
  /** Panic vent window: force 1.0 G regardless of the sim. */
  panic: boolean;
}

/** G to POST this tick, or null to post nothing at all. */
export function gToPost(g: number, s: PostState): number | null {
  if (s.killed) return null;
  if (s.panic || !s.running || s.stalled) return PAUSED_G;
  return g;
}
