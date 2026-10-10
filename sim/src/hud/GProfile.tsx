/**
 * The G profile of the whole sortie, with a playhead.
 *
 * This is the clearest answer to "does it go through a set amount of G": the
 * shape is fixed before the flight starts, and the playhead just walks along it.
 */

import type { Track } from "../flight/track";
import { CUFF_FULL_G } from "./GMeter";

const W = 300;
const H = 72;

export function GProfile({ track, t }: { track: Track; t: number }) {
  const { points, duration } = track;
  const gMin = -1;
  const gMax = 7;

  const px = (time: number) => (time / Math.max(duration, 1)) * W;
  const py = (g: number) => H - ((Math.max(gMin, Math.min(gMax, g)) - gMin) / (gMax - gMin)) * H;

  const line = points.map((p) => `${px(p.t).toFixed(1)},${py(p.g).toFixed(1)}`).join(" ");

  return (
    <div className="gprofile">
      <div className="label">
        G PROFILE - PEAK {track.peakG.toFixed(1)} G OVER {duration.toFixed(0)} S
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect x="0" y="0" width={W} height={H} fill="rgba(0,0,0,0.35)" />
        {/* 1 G, and the point the cuff is full. */}
        <line x1="0" y1={py(1)} x2={W} y2={py(1)} stroke="rgba(125,255,168,0.3)" strokeWidth="1" />
        <line
          x1="0"
          y1={py(CUFF_FULL_G)}
          x2={W}
          y2={py(CUFF_FULL_G)}
          stroke="rgba(255,107,107,0.35)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text x="2" y={py(1) - 3} className="gp-tick">
          1 G
        </text>
        <text x="2" y={py(CUFF_FULL_G) - 3} className="gp-tick">
          {CUFF_FULL_G} G - CUFF FULL
        </text>
        <polyline points={line} fill="none" stroke="var(--hud)" strokeWidth="1.5" />
        <line x1={px(t)} y1="0" x2={px(t)} y2={H} stroke="#fff" strokeWidth="1" />
      </svg>
    </div>
  );
}
