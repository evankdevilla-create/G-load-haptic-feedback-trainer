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
const TICKS = [-1, 1, 3, 6, 10];

export function cuffFill(g: number): number {
  const fill = (g - CUFF_EMPTY_G) / (CUFF_FULL_G - CUFF_EMPTY_G);
  return Math.max(0, Math.min(1, fill));
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
  return (
    <div className="gmeter">
      <div className="gvalue" data-over={over}>
        {g.toFixed(1)}
        <span className="gunit">G</span>
      </div>
      <div className="gbar">
        <div className="gbar-fill" data-over={over} style={{ transform: `scaleX(${toFrac(g)})` }} />
        <div className="gbar-full" style={{ left: `${toFrac(CUFF_FULL_G) * 100}%` }} />
        <div className="gbar-cmd" style={{ left: `${toFrac(commanded) * 100}%` }} />
      </div>
      <div className="gticks">
        {TICKS.map((t) => (
          <span key={t} style={{ left: `${toFrac(t) * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
      {limited && <div className="gwarn">too slow for {commanded.toFixed(1)} G</div>}
    </div>
  );
}
