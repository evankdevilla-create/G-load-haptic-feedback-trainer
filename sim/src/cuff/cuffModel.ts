/**
 * COMMANDED cuff fill derived from G. This is what the sim asks the cuff to do,
 * NOT a measured pressure: there is no pressure sensor on the rig. Label it
 * "commanded" anywhere it is shown.
 *
 * The firmware holds a PRELOAD at 1 G (trainer_logic.h: preloadMs / inflateMs),
 * so 1 G is not an empty cuff: it sits at the baseline and G adds squeeze on top
 * up to full at 6 G. Only "no data" (dead-man) vents all the way to empty.
 * Keep these constants in step with the firmware.
 */

export const G_EMPTY = 1;
export const G_FULL = 6;
/** preloadMs / inflateMs from firmware/g_trainer/trainer_logic.h. */
export const PRELOAD_FILL = 25000 / 30000;

/** Linear fill for a given G, clamped to PRELOAD_FILL..1. NaN (no data) is empty. */
export function commandedFill(g: number): number {
  if (Number.isNaN(g)) return 0;
  const f = Math.min(1, Math.max(0, (g - G_EMPTY) / (G_FULL - G_EMPTY)));
  return PRELOAD_FILL + (1 - PRELOAD_FILL) * f;
}

/** e.g. 0.66 -> "66%". */
export function fillLabel(f: number): string {
  const c = Number.isNaN(f) ? 0 : Math.min(1, Math.max(0, f));
  return `${Math.round(c * 100)}%`;
}
