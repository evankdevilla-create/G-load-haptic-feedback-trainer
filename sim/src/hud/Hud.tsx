/** What is drawn over the 3D view: the G readout, the controls, and nothing else. */

import type { FlightMode, FlightState } from "../flight/types";
import { GMeter } from "./GMeter";
import { Horizon } from "./Horizon";
import { KeyHints } from "./ManualPanel";

const KNOTS_PER_MS = 1.944;
const FEET_PER_M = 3.281;
const pad = (n: number, w: number) => String(Math.round(n)).padStart(w, "0");

function FlightStrip({ state }: { state: FlightState }) {
  const hdg = (((state.psi * 180) / Math.PI) % 360 + 360) % 360;
  const items: Array<[string, string, string]> = [
    ["SPD", pad(state.v * KNOTS_PER_MS, 3), "kt"],
    ["ALT", Math.round(state.pos.y * FEET_PER_M).toLocaleString("en-US"), "ft"],
    ["HDG", pad(hdg % 360, 3), "\u00b0"],
  ];
  return (
    <div className="panel flightstrip" role="group" aria-label="Flight data">
      {items.map(([k, v, u]) => (
        <div key={k}>
          <span className="fs-k">{k}</span>
          <span className="fs-v">{v}</span>
          <span className="fs-u">{u}</span>
        </div>
      ))}
    </div>
  );
}

export function Hud({
  state,
  running,
  mode,
  cuffEnabled,
  onToggleRunning,
  onRestart,
  onToggleCuff,
  view = "chase",
}: {
  state: FlightState;
  running: boolean;
  mode: FlightMode;
  cuffEnabled: boolean;
  onToggleRunning: () => void;
  onRestart: () => void;
  onToggleCuff: () => void;
  view?: "cockpit" | "chase";
}) {
  return (
    <div className="overlay">
      {view === "cockpit" && <Horizon state={state} />}
      <KeyHints mode={mode} />
      <FlightStrip state={state} />
      <div className="panel gpanel">
        <GMeter g={state.g} commanded={state.gCommanded} limited={state.gLimited} />
        <p className="honest-note">Haptic cue = preload + G squeeze. Not a G-force simulator.</p>
      </div>
      <div className="panel controls interactive">
        <button onClick={onToggleRunning}>{running ? "Pause" : "Fly"}</button>
        <button onClick={onRestart}>Restart</button>
        <button onClick={onToggleCuff} aria-pressed={cuffEnabled}>
          Cuff
        </button>
      </div>
    </div>
  );
}
