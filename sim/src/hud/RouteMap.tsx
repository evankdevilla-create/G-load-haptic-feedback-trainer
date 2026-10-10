/**
 * Plan view of the set route, with the aeroplane's current position on it.
 *
 * The whole track is drawn from a deterministic pre-flight of the same physics,
 * so what you see here is exactly the path that will be flown.
 */

import type { Track } from "../flight/track";

const SIZE = 160; // px
const PAD = 12;

export function RouteMap({
  track,
  x,
  z,
  headingRad,
}: {
  track: Track;
  x: number;
  z: number;
  headingRad: number;
}) {
  const { bounds, points } = track;
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1);
  // One scale for both axes, so the track keeps its real shape.
  const span = Math.max(spanX, spanZ);
  const scale = (SIZE - PAD * 2) / span;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  // Screen y grows downward and north is -Z, so north ends up at the top.
  const px = (wx: number) => SIZE / 2 + (wx - cx) * scale;
  const py = (wz: number) => SIZE / 2 + (wz - cz) * scale;

  const path = points.map((p) => `${px(p.x).toFixed(1)},${py(p.z).toFixed(1)}`).join(" ");
  const headingDeg = (headingRad * 180) / Math.PI;

  return (
    <div className="routemap">
      <div className="label">GROUND TRACK</div>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <rect x="0" y="0" width={SIZE} height={SIZE} fill="rgba(0,0,0,0.35)" />
        <text x="6" y="14" className="rm-n">
          N
        </text>
        <polyline points={path} fill="none" stroke="var(--hud-dim)" strokeWidth="1.5" />
        {/* Where we started. */}
        <circle cx={px(0)} cy={py(0)} r="2.5" fill="none" stroke="var(--hud-dim)" strokeWidth="1" />
        {/* Us, pointing where we are pointing. */}
        <g transform={`translate(${px(x).toFixed(1)} ${py(z).toFixed(1)}) rotate(${headingDeg.toFixed(1)})`}>
          <path d="M0,-5 L3.4,4 L0,2 L-3.4,4 Z" fill="var(--hud)" />
        </g>
      </svg>
    </div>
  );
}
