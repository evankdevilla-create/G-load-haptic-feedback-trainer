/**
 * Cockpit-view horizon: pitch ladder + horizon line + fixed pipper. Transform
 * only; fed by the sampled flight state, so it updates at the HUD rate.
 * Each stroke is drawn twice (dark wide, light thin) for contrast on any sky.
 */

import { useEffect, useState } from "react";
import type { FlightState } from "../flight/types";
import { useFrameValue } from "./useFrameValue";

/** Must match the 3D camera in scene/Scene.tsx (vertical field of view, degrees). */
export const CAMERA_FOV_DEG = 72;
const RUNGS = [10, 20, 30, 40, 50, 60, 70, 80];
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
/** Keep rungs out of the tan() blow-up near +-90 degrees off the view axis. */
const MAX_OFF_AXIS_DEG = 75;

/**
 * Pixels from the screen centre to an object `offDeg` degrees above the view axis,
 * using the camera's real perspective projection (not a linear degrees-to-pixels
 * guess), so the artificial horizon sits ON the 3D scene's horizon at any pitch.
 */
export function screenOffsetPx(offDeg: number, viewportHeightPx: number): number {
  const f = viewportHeightPx / 2 / Math.tan((CAMERA_FOV_DEG / 2) * RAD);
  return f * Math.tan(offDeg * RAD);
}

function Marks({ pitchDeg, heightPx }: { pitchDeg: number; heightPx: number }) {
  // The horizon is `pitchDeg` below the view axis when the nose is up.
  const y = (s: number) => -screenOffsetPx(s - pitchDeg, heightPx);
  const visible = (s: number) => Math.abs(s - pitchDeg) < MAX_OFF_AXIS_DEG;
  const half = heightPx * 0.46;
  return (
    <>
      <line x1={-half * 1.6} y1={y(0)} x2={-60} y2={y(0)} />
      <line x1={60} y1={y(0)} x2={half * 1.6} y2={y(0)} />
      {RUNGS.flatMap((d) =>
        [d, -d].filter(visible).map((s) => {
          const yy = y(s);
          const dash = s < 0 ? "6 6" : undefined;
          return (
            <g key={s}>
              <polyline points={`-60,${yy} -30,${yy} `} strokeDasharray={dash} />
              <polyline points={`30,${yy} 60,${yy}`} strokeDasharray={dash} />
              <text x={70} y={yy + 4} fontSize={13} fill="#d8f5d0" stroke="#05080a" strokeWidth={3.5} paintOrder="stroke" strokeLinejoin="round">
                {Math.abs(s)}
              </text>
            </g>
          );
        }),
      )}
    </>
  );
}

function Pipper() {
  return (
    <>
      <circle r={7} fill="none" />
      <line x1={-24} y1={0} x2={-12} y2={0} />
      <line x1={12} y1={0} x2={24} y2={0} />
      <line x1={0} y1={-24} x2={0} y2={-12} />
    </>
  );
}

/** The viewport's pixel size, so the overlay can use the camera's real projection. */
function useViewportSize(): { w: number; h: number } {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

export function Horizon({ state: sampled, getState }: { state: FlightState; getState?: () => FlightState }) {
  const { w, h } = useViewportSize();
  const state = useFrameValue(getState ?? (() => sampled));
  const roll = state.phi * DEG;
  const pitch = (state.gamma + state.alpha) * DEG;
  const layers: Array<[string, number, string]> = [
    ["#05080a", 4, "#05080a"],
    ["#d8f5d0", 1.5, "#d8f5d0"],
  ];
  return (
    <svg
      className="horizon"
      viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="hz-clip">
          <circle r={h * 0.46} />
        </clipPath>
        <g id="hz-marks">
          <Marks pitchDeg={pitch} heightPx={h} />
        </g>
        <g id="hz-pipper">
          <Pipper />
        </g>
      </defs>
      <g clipPath="url(#hz-clip)">
        <g transform={`rotate(${-roll.toFixed(2)})`}>
          {layers.map(([stroke, sw, fill]) => (
            <use key={stroke} href="#hz-marks" stroke={stroke} strokeWidth={sw} fill={fill} />
          ))}
        </g>
      </g>
      {layers.map(([stroke, sw]) => (
        <use key={stroke} href="#hz-pipper" stroke={stroke} strokeWidth={sw} />
      ))}
    </svg>
  );
}
