/** What is drawn over the 3D view: the instrument cluster, the controls, and nothing else. */

import type { FlightState } from "../flight/types";
import { InstrumentCluster } from "./instruments/InstrumentCluster";
import { Horizon } from "./Horizon";
import { Menu } from "./Menu";
import type { MenuProps } from "./Menu";

export function Hud({
  state,
  view = "chase",
  getRenderState,
  ...menu
}: MenuProps & {
  state: FlightState;
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
      <Menu {...menu} />
      <InstrumentCluster state={state} getState={getRenderState} />
    </div>
  );
}
