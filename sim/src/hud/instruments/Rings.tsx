/**
 * The four round gauges. Flat SVG, 100x100 viewBox, centre (50,50). The scales,
 * ticks and ladders are built once at module load; per frame only the needle and
 * ball `transform`s and the digits change.
 */

import { memo } from "react";
import { CUFF_FULL_G } from "../GMeter";
import { altimeterPointers, FEET_PER_M, KNOTS_PER_MS, vviFpm } from "./air";
import { arcPath, makeTicks, pitchToPx, polar, valueToAngle, type Hold, type Tick } from "./scale";

const C = 50;
const f = (n: number) => n.toFixed(2);

interface Spec {
  min: number;
  max: number;
  start: number;
  sweep: number;
}
const angleOf = (s: Spec, v: number) => valueToAngle(v, s.min, s.max, s.start, s.sweep);

/** Pre-built strokes and labels for one scale. */
interface ScaleGeo {
  minor: string;
  major: string;
  labels: Array<{ x: number; y: number; text: string; cls?: string }>;
}

function buildScale(
  s: Spec,
  ticks: Tick[],
  rOut: number,
  rLabel: number,
  opts: { minorLen?: number; majorLen?: number; label?: (t: Tick) => string; labelCls?: (t: Tick) => string | undefined } = {},
): ScaleGeo {
  const { minorLen = 2.5, majorLen = 5, label = (t) => t.label ?? "", labelCls } = opts;
  const stroke = (major: boolean) =>
    ticks
      .filter((t) => t.major === major)
      .map((t) => {
        const a = angleOf(s, t.value);
        const p = polar(C, C, rOut, a);
        const q = polar(C, C, rOut - (major ? majorLen : minorLen), a);
        return `M${f(p.x)} ${f(p.y)}L${f(q.x)} ${f(q.y)}`;
      })
      .join("");
  const labels = ticks
    .filter((t) => t.major)
    .map((t) => {
      const p = polar(C, C, rLabel, angleOf(s, t.value));
      return { x: p.x, y: p.y, text: label(t), cls: labelCls?.(t) };
    });
  return { minor: stroke(false), major: stroke(true), labels };
}

const Scale = memo(function Scale({ geo }: { geo: ScaleGeo }) {
  return (
    <>
      <path className="ins-minor" d={geo.minor} />
      <path className="ins-major" d={geo.major} />
      {geo.labels.map((l, i) => (
        <text key={i} className={`ins-lab ${l.cls ?? ""}`} x={f(l.x)} y={f(l.y)} textAnchor="middle" dominantBaseline="central">
          {l.text}
        </text>
      ))}
    </>
  );
});

function Needle({ angle, len = 40, tail = 9, w = 1.7, cls = "ins-needle" }: { angle: number; len?: number; tail?: number; w?: number; cls?: string }) {
  return (
    <g transform={`rotate(${angle.toFixed(2)} ${C} ${C})`}>
      <path className={cls} d={`M${C} ${C - len}L${C + w} ${C}L${C} ${C + tail}L${C - w} ${C}Z`} />
    </g>
  );
}

const Hub = ({ r = 2.6 }: { r?: number }) => <circle className="ins-hub" cx={C} cy={C} r={r} />;

/** Marker on the rim pointing at the scale; `hollow` for the minimum marker. */
function RimMarker({ angle, hollow }: { angle: number; hollow?: boolean }) {
  return (
    <g transform={`rotate(${angle.toFixed(2)} ${C} ${C})`}>
      <path className={hollow ? "ins-mark-min" : "ins-mark-max"} d={`M${C} ${C - 41.5}L${C - 2.6} ${C - 46.5}H${C + 2.6}Z`} />
    </g>
  );
}

const Face = () => <circle className="ins-face" cx={C} cy={C} r={49.5} />;

// --- G / accelerometer -------------------------------------------------------

export const G_SPEC: Spec = { min: -5, max: 10, start: -135, sweep: 270 };
const G_GEO = buildScale(G_SPEC, makeTicks(-5, 10, 1, 1), 44.5, 34, {
  labelCls: (t) => (t.value === CUFF_FULL_G ? "ins-lab-accent" : undefined),
});
const G_FULL_TICK = (() => {
  const a = angleOf(G_SPEC, CUFF_FULL_G);
  const p = polar(C, C, 47.5, a);
  const q = polar(C, C, 40, a);
  return `M${f(p.x)} ${f(p.y)}L${f(q.x)} ${f(q.y)}`;
})();
const G_RED_ARC = arcPath(C, C, 47.3, angleOf(G_SPEC, 9), angleOf(G_SPEC, 10));
const G_ZERO_ANGLE = angleOf(G_SPEC, 0);

export function GRing({ g, hold }: { g: number; hold: Hold }) {
  const a = angleOf(G_SPEC, g);
  const zone = g > 8 ? "extreme" : g > CUFF_FULL_G ? "full" : "idle";
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <Face />
      <path className="ins-fill" d={arcPath(C, C, 47.3, G_ZERO_ANGLE, a)} />
      <path className="ins-red" d={G_RED_ARC} />
      <Scale geo={G_GEO} />
      <path className="ins-full-tick" d={G_FULL_TICK} />
      <text className="ins-lab ins-lab-accent" x={69} y={34.5} textAnchor="middle" fontSize={5.2}>
        CUFF
      </text>
      <text className="ins-lab ins-lab-accent" x={69} y={40.5} textAnchor="middle" fontSize={5.2}>
        FULL
      </text>
      <RimMarker angle={angleOf(G_SPEC, hold.max)} />
      <RimMarker angle={angleOf(G_SPEC, hold.min)} hollow />
      <Needle angle={a} len={41} />
      <Hub />
      <text className="ins-num ins-g" data-zone={zone} x={C} y={67} textAnchor="middle" fontSize={21}>
        {g.toFixed(1)}
      </text>
      <text className="ins-name" x={C} y={77} textAnchor="middle" fontSize={7}>
        G
      </text>
    </svg>
  );
}

// --- airspeed ---------------------------------------------------------------

export const SPEED_SPEC: Spec = { min: 0, max: 700, start: -135, sweep: 270 };
const SPEED_GEO = buildScale(SPEED_SPEC, makeTicks(0, 700, 25, 4), 44.5, 34);

export function SpeedRing({ vMs }: { vMs: number }) {
  const kt = vMs * KNOTS_PER_MS;
  const a = angleOf(SPEED_SPEC, kt);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <Face />
      <path className="ins-fill" d={arcPath(C, C, 47.3, SPEED_SPEC.start, a)} />
      <Scale geo={SPEED_GEO} />
      <Needle angle={a} len={41} />
      <Hub />
      <text className="ins-num" x={C} y={67} textAnchor="middle" fontSize={17}>
        {Math.round(Number.isFinite(kt) ? kt : 0)}
      </text>
      <text className="ins-name" x={C} y={77} textAnchor="middle" fontSize={7}>
        TAS KT
      </text>
    </svg>
  );
}

// --- altimeter --------------------------------------------------------------

const ALT_SPEC: Spec = { min: 0, max: 1000, start: 0, sweep: 360 };
const ALT_GEO = buildScale(ALT_SPEC, makeTicks(0, 1000, 20, 5).slice(0, -1), 44.5, 35, {
  minorLen: 2.2,
  majorLen: 4.5,
  label: (t) => String(t.value / 100),
});

export function AltRing({ altM }: { altM: number }) {
  const ft = altM * FEET_PER_M;
  const { hundreds, thousands } = altimeterPointers(ft);
  const shown = Math.round(Number.isFinite(ft) ? ft : 0).toLocaleString("en-US");
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <Face />
      <Scale geo={ALT_GEO} />
      <text className="ins-name" x={C} y={33} textAnchor="middle" fontSize={7}>
        ALT FT
      </text>
      <Needle angle={thousands} len={22} tail={5} w={3} cls="ins-needle-short" />
      <Needle angle={hundreds} len={41} />
      <Hub />
      <rect className="ins-window" x={27} y={58} width={46} height={12} />
      <text className="ins-num" x={C} y={64.5} textAnchor="middle" dominantBaseline="central" fontSize={9.5}>
        {shown}
      </text>
    </svg>
  );
}

export function vviLabel(vMs: number, gamma: number): string {
  const fpm = Math.round(vviFpm(vMs, gamma) / 10) * 10;
  return `${fpm > 0 ? "+" : fpm < 0 ? "-" : ""}${Math.abs(fpm).toLocaleString("en-US")}`;
}

// --- attitude (ADI) ----------------------------------------------------------

const BALL_R = 40;
/** SVG units per degree of pitch. */
const PPD = 1;
const RUNGS = Array.from({ length: 17 }, (_, i) => (i + 1) * 5); // 5..85
const rungPath = (sign: 1 | -1, major: boolean) =>
  RUNGS.filter((p) => (p % 10 === 0) === major)
    .map((p) => {
      const y = C - sign * p * PPD;
      const h = major ? 10 : 5;
      return `M${C - h} ${f(y)}H${C + h}`;
    })
    .join("");
const RUNG_LABELS = RUNGS.filter((p) => p % 10 === 0 && p < 90).flatMap((p) =>
  [1, -1].flatMap((sign) => [
    { x: C - 12, y: C - sign * p * PPD, text: String(p), anchor: "end" as const },
    { x: C + 12, y: C - sign * p * PPD, text: String(p), anchor: "start" as const },
  ]),
);

const Ladder = memo(function Ladder() {
  return (
    <>
      <rect className="adi-sky" x={-250} y={-250} width={600} height={300} />
      <rect className="adi-ground" x={-250} y={C} width={600} height={300} />
      <path className="adi-rung" d={rungPath(1, true) + rungPath(1, false)} />
      <path className="adi-rung adi-rung-neg" d={rungPath(-1, true) + rungPath(-1, false)} />
      <path className="adi-horizon" d={`M-250 ${C}H350`} />
      {RUNG_LABELS.map((l, i) => (
        <text key={i} className="adi-rung-lab" x={l.x} y={l.y} textAnchor={l.anchor} dominantBaseline="central" fontSize={4.6}>
          {l.text}
        </text>
      ))}
    </>
  );
});

const BANK_MARKS = [0, 10, 20, 30, 45, 60, 90];
const BANK_PATH = BANK_MARKS.flatMap((b) => (b === 0 ? [0] : [b, -b]))
  .map((b) => {
    const long = b === 0 || b % 30 === 0;
    const p = polar(C, C, 48, b);
    const q = polar(C, C, 48 - (long ? 5 : 3), b);
    return `M${f(p.x)} ${f(p.y)}L${f(q.x)} ${f(q.y)}`;
  })
  .join("");

export function AdiRing({ pitchDeg, bankDeg }: { pitchDeg: number; bankDeg: number }) {
  const py = pitchToPx(pitchDeg, PPD);
  const bank = Number.isFinite(bankDeg) ? bankDeg : 0;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="adi-clip">
          <circle cx={C} cy={C} r={BALL_R} />
        </clipPath>
      </defs>
      <Face />
      <path className="ins-major" d={BANK_PATH} />
      <path className="ins-full-tick" d={`M${C} 2L${C} 8`} />
      <g clipPath="url(#adi-clip)">
        <g transform={`rotate(${(-bank).toFixed(2)} ${C} ${C})`}>
          <g transform={`translate(0 ${py.toFixed(2)})`}>
            <Ladder />
          </g>
          <path className="adi-pointer" d={`M${C} 10.5L${C - 3} 16H${C + 3}Z`} />
        </g>
      </g>
      <circle className="adi-ring" cx={C} cy={C} r={BALL_R} />
      <g className="adi-acft-halo">
        <path d={`M22 ${C}H42V${C + 4}M78 ${C}H58V${C + 4}`} />
        <circle cx={C} cy={C} r={1.8} />
      </g>
      <g className="adi-acft">
        <path d={`M22 ${C}H42V${C + 4}M78 ${C}H58V${C + 4}`} />
        <circle cx={C} cy={C} r={1.8} />
      </g>
    </svg>
  );
}
