/** What is drawn over the 3D view: the instrument cluster, the controls, and nothing else. */

import type { FlightMode, FlightState } from "../flight/types";
import { InstrumentCluster } from "./instruments/InstrumentCluster";
import { Horizon } from "./Horizon";
import { KeyHints } from "./ManualPanel";

export function Hud({
  state,
  running,
  mode,
  cuffEnabled,
  onToggleRunning,
  onRestart,
  onToggleCuff,
  view = "chase",
  getRenderState,
}: {
  state: FlightState;
  running: boolean;
  mode: FlightMode;
  cuffEnabled: boolean;
  onToggleRunning: () => void;
  onRestart: () => void;
  onToggleCuff: () => void;
  view?: "cockpit" | "chase";
  /** Per-frame interpolated state for the cockpit horizon (smooth, unlike the 20 Hz `state`). */
  getRenderState?: () => FlightState;
}) {
  return (
    <div className="overlay">
      {view === "cockpit" && <Horizon state={state} getState={getRenderState} />}
      {state.crashed && (
        <div className="panel crash-banner" role="alert">
          <strong>CRASHED</strong>
          <span>
            Press <kbd>R</kbd> to restart. The cuff stays at its baseline.
          </span>
        </div>
      )}
      <KeyHints mode={mode} />
      <InstrumentCluster state={state} getState={getRenderState} />
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
