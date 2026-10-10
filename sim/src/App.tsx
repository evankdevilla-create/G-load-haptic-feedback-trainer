/**
 * First-person cockpit sim that flies a set route at set G, and drives the
 * pressure cuff while it does it.
 *
 * The chain, end to end:
 *
 *   route.ts (the set G schedule)
 *     -> dynamics.ts (3-DOF flight model, G is the input)
 *       -> this app: cockpit view + HUD
 *         -> useCuffLink: POST G at 20 Hz
 *           -> server/g-server.mjs (pretends to be FlightGear)
 *             -> bridge/bridge.py --live (unchanged)
 *               -> Arduino -> relay -> pump + valve -> cuff
 */

import { useMemo, useState } from "react";
import { DEMO_ROUTE } from "./flight/route";
import { flyTrack } from "./flight/track";
import { useFlight, useSampled } from "./flight/useFlight";
import { CockpitFrame } from "./hud/CockpitFrame";
import { Hud } from "./hud/Hud";
import { Scene } from "./scene/Scene";
import { useCuffLink } from "./telemetry/useCuffLink";

export function App() {
  const route = DEMO_ROUTE;
  const flight = useFlight(route);
  const [cuffEnabled, setCuffEnabled] = useState(true);

  // Pre-fly the route once for the map and the G profile. Deterministic physics
  // means this is the real flight, not a sketch of it.
  const track = useMemo(() => flyTrack(route), [route]);

  const link = useCuffLink(flight.stateRef, flight.lastStepAtRef, route, {
    enabled: cuffEnabled,
    running: flight.running,
  });

  // The physics runs at 100 Hz but React only needs to redraw the HUD at 20.
  const hudState = useSampled(() => flight.stateRef.current, 20);

  return (
    <>
      <Scene flight={flight} />
      <CockpitFrame />
      <Hud
        state={hudState}
        route={route}
        track={track}
        link={link}
        cuffEnabled={cuffEnabled}
        running={flight.running}
        looping={flight.looping}
        onToggleRunning={flight.toggleRunning}
        onRestart={flight.restart}
        onToggleLooping={flight.toggleLooping}
        onToggleCuff={() => setCuffEnabled((v) => !v)}
      />
    </>
  );
}
