/**
 * The G meter, and what the cuff is doing about it.
 *
 * The lower bar is the useful part for this project: it mirrors the mapping in
 * the firmware (1 G = empty, about 6 G = full), so you can see the squeeze the
 * wearer should be feeling at that instant, not just the number.
 */

/** Must match `firmware/g_trainer/trainer_logic.h`. 1 G empty, 6 G full. */
export const CUFF_EMPTY_G = 1;
export const CUFF_FULL_G = 6;

export function cuffFill(g: number): number {
  const fill = (g - CUFF_EMPTY_G) / (CUFF_FULL_G - CUFF_EMPTY_G);
  return Math.max(0, Math.min(1, fill));
}

function bandColour(g: number): string {
  if (g < 0.5) return "var(--warn)"; // unloaded or negative
  if (g < 2.5) return "var(--hud)";
  if (g < 4.5) return "#ffe08a";
  return "var(--alarm)";
}

export function GMeter({
  g,
  commanded,
  limited,
}: {
  g: number;
  commanded: number;
  limited: boolean;
}) {
  const fill = cuffFill(g);
  const colour = bandColour(g);
  // The scale runs -1 to 9 G, matching what the firmware will accept.
  const toPct = (value: number) => ((Math.max(-1, Math.min(9, value)) + 1) / 10) * 100;

  return (
    <div className="gmeter">
      <div className="gmeter-head">
        <span className="label">G</span>
        <span className="gvalue" style={{ color: colour }}>
          {g.toFixed(2)}
        </span>
      </div>

      {/* Actual G against the scale, with a tick for what the route asked for. */}
      <div className="gscale">
        <div className="gscale-track">
          <div
            className="gscale-fill"
            style={{ width: `${toPct(g)}%`, background: colour }}
          />
          <div className="gscale-zero" style={{ left: `${toPct(1)}%` }} />
          <div className="gscale-cmd" style={{ left: `${toPct(commanded)}%` }} />
        </div>
        <div className="gscale-marks">
          <span>-1</span>
          <span>1</span>
          <span>3</span>
          <span>6</span>
          <span>9</span>
        </div>
      </div>

      {/* What the cuff should be doing right now. */}
      <div className="cuff">
        <span className="label">
          CUFF {Math.round(fill * 100)}%
        </span>
        <div className="cuff-track">
          <div className="cuff-fill" style={{ width: `${fill * 100}%` }} />
        </div>
      </div>

      {limited && <div className="warn">LIFT LIMITED - too slow for {commanded.toFixed(1)} G</div>}
    </div>
  );
}
