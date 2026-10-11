/** What is drawn over the 3D view: the G readout, the controls, and nothing else. */

import type { FlightMode, FlightState } from "../flight/types";
import { GMeter } from "./GMeter";
import { KeyHints } from "./ManualPanel";

export function Hud({
  state,
  running,
  mode,
  cuffEnabled,
  onToggleRunning,
  onRestart,
  onToggleCuff,
}: {
  state: FlightState;
  running: boolean;
  mode: FlightMode;
  cuffEnabled: boolean;
  onToggleRunning: () => void;
  onRestart: () => void;
  onToggleCuff: () => void;
}) {
  return (
    <div className="overlay">
      <KeyHints mode={mode} />
      <div className="panel gpanel">
        <GMeter g={state.g} commanded={state.gCommanded} limited={state.gLimited} />
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
