/**
 * Dial geometry. Pure functions, no React. Angles are degrees clockwise from
 * 12 o'clock (so a gauge that starts at 7:30 begins at -135).
 */

const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

/** Needle angle for `value` on a scale that spans `sweepDeg` from `startDeg`. Clamped, NaN-safe. */
export function valueToAngle(value: number, min: number, max: number, startDeg: number, sweepDeg: number): number {
  const v = Number.isNaN(value) ? min : Math.max(min, Math.min(max, value));
  return startDeg + ((v - min) / (max - min)) * sweepDeg;
}

export interface Point {
  x: number;
  y: number;
}

export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

const f2 = (n: number) => n.toFixed(2);

/** SVG path for a clockwise arc from a0 to a1 degrees; "" when empty or not finite. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (!Number.isFinite(a0) || !Number.isFinite(a1) || Math.abs(a1 - a0) < 1e-6) return "";
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${f2(s.x)} ${f2(s.y)} A ${r} ${r} 0 ${large} ${sweep} ${f2(e.x)} ${f2(e.y)}`;
}

export interface Tick {
  value: number;
  major: boolean;
  label?: string;
}

/** A tick every `step` from min to max; every `majorEvery`-th one is major and labelled. */
export function makeTicks(min: number, max: number, step: number, majorEvery: number): Tick[] {
  if (!(step > 0) || !Number.isFinite(step) || !Number.isFinite(min) || !Number.isFinite(max)) return [];
  const n = Math.round((max - min) / step);
  const out: Tick[] = [];
  for (let i = 0; i <= n; i++) {
    const value = Math.round((min + i * step) * 1e6) / 1e6;
    const major = i % majorEvery === 0;
    out.push(major ? { value, major, label: String(value) } : { value, major });
  }
  return out;
}

export interface Hold {
  max: number;
  min: number;
  t: number;
}

/** Peak / trough G since the last restart. A time that goes backwards means a restart. */
export function updateHold(prev: Hold | undefined, g: number, t: number): Hold {
  if (!Number.isFinite(g)) return prev ?? { max: 1, min: 1, t: finite(t, 0) };
  const time = finite(t, 0);
  if (!prev || time < prev.t) return { max: g, min: g, t: time };
  return { max: Math.max(prev.max, g), min: Math.min(prev.min, g), t: time };
}

/** Vertical shift of the ADI ball for a nose pitch (positive pitch moves the ground up). */
export function pitchToPx(pitchDeg: number, pxPerDeg: number): number {
  return Math.max(-90, Math.min(90, finite(pitchDeg, 0))) * pxPerDeg;
}

export function wrapDeg(deg: number): number {
  return ((finite(deg, 0) % 360) + 360) % 360;
}
