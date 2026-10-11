/**
 * Exhaust plume length for a throttle setting, in metres. A small dry plume up to
 * military power (throttle 0.5, which holds cruise speed), then a long afterburner
 * plume as the throttle goes past it. Pure so it can be tested.
 */

export const FLAME_MIN_M = 0.5;
export const FLAME_MIL_M = 1.8;
export const FLAME_MAX_M = 6;

export function flameLength(throttle: number): number {
  const t = Number.isFinite(throttle) ? Math.min(1, Math.max(0, throttle)) : 0;
  if (t <= 0.5) return FLAME_MIN_M + ((FLAME_MIL_M - FLAME_MIN_M) * t) / 0.5;
  return FLAME_MIL_M + ((FLAME_MAX_M - FLAME_MIL_M) * (t - 0.5)) / 0.5;
}
