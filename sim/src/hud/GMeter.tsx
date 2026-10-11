/**
 * The G readout: one big number and a bar. The tick marks where the cuff is
 * full (see `firmware/g_trainer/trainer_logic.h`), so you can see when more pull
 * stops adding squeeze.
 */

/** Must match `firmware/g_trainer/trainer_logic.h`. 1 G empty, 6 G full. */
export const CUFF_EMPTY_G = 1;
export const CUFF_FULL_G = 6;

/** Scale of the bar. The pilot can pull to SCALE_MAX_G. */
const SCALE_MIN_G = -1;
const SCALE_MAX_G = 10;
const TICKS: Array<[number, string]> = [
  [-1, "-1"],
  [1, "1 G"],
  [3, "3"],
  [CUFF_FULL_G, "6 cuff full"],
  [10, "10"],
];

type GZone = "idle" | "ramp" | "full" | "extreme";
const zoneOf = (g: number): GZone => (g > 8 ? "extreme" : g > CUFF_FULL_G ? "full" : g > CUFF_EMPTY_G + 0.5 ? "ramp" : "idle");

export function cuffFill(g: number): number {
  const fill = (g - CUFF_EMPTY_G) / (CUFF_FULL_G - CUFF_EMPTY_G);
  return Math.max(0, Math.min(1, fill));
}

/** Above this the cuff is full and extra G changes nothing. */
export const SATURATED_G = 6.05;

/** Text + icon, so it never relies on colour alone. */
export function SatTag() {
  return (
    <div className="sat-tag">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M2 3h12M8 14V6M4.5 9.5L8 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      cuff saturated at {CUFF_FULL_G} G
    </div>
  );
}

const toFrac = (g: number) =>
  (Math.max(SCALE_MIN_G, Math.min(SCALE_MAX_G, g)) - SCALE_MIN_G) / (SCALE_MAX_G - SCALE_MIN_G);

export function GMeter({
  g,
  commanded,
  limited,
}: {
  g: number;
  commanded: number;
  limited: boolean;
}) {
  const over = g > CUFF_FULL_G;
  const zone = zoneOf(g);
  return (
    <div className="gmeter">
      <div className="gvalue" data-over={over} data-zone={zone}>
        {g.toFixed(1)}
        <span className="gunit">G</span>
      </div>
      <div className="gbar">
        <div className="gbar-fill" data-zone={zone} style={{ transform: `scaleX(${toFrac(g)})` }} />
        <div className="gbar-full" style={{ left: `${toFrac(CUFF_FULL_G) * 100}%` }} />
        <div className="gbar-cmd" style={{ left: `${toFrac(commanded) * 100}%` }} />
      </div>
      <div className="gticks">
        {TICKS.map(([t, label]) => (
          <span key={t} data-full={t === CUFF_FULL_G} style={{ left: `${toFrac(t) * 100}%` }}>
            {label}
          </span>
        ))}
      </div>
      {g > SATURATED_G && <SatTag />}
      {limited && <div className="gwarn">too slow for {commanded.toFixed(1)} G</div>}
    </div>
  );
}
