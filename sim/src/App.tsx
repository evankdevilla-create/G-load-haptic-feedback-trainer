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

import { useCallback, useEffect, useState } from "react";
import { DEMO_ROUTE } from "./flight/route";
import { useFlight, useSampled } from "./flight/useFlight";
import { usePilotInput } from "./input/usePilotInput";
import { CuffPanel } from "./hud/CuffPanel";
import { Hud } from "./hud/Hud";
import { Scene } from "./scene/Scene";
import { useCuffLink } from "./telemetry/useCuffLink";
import { useVoiceCallouts } from "./voice/useVoiceCallouts";

export function App() {
  const route = DEMO_ROUTE;
  const pilot = usePilotInput();
  const flight = useFlight(route, pilot);
  const [cuffEnabled, setCuffEnabled] = useState(true);

  const link = useCuffLink(flight.stateRef, flight.lastStepAtRef, route, {
    enabled: cuffEnabled,
    running: flight.running,
  });

  const voice = useVoiceCallouts(() => (link.killed ? 1 : flight.stateRef.current.g), flight.running);

  // The physics runs at 100 Hz but React only needs to redraw the HUD at 20.
  const hudState = useSampled(() => flight.stateRef.current, 20);

  const cuffG = hudState.g;
  const { release } = pilot;
  const { toggleKill, panicVent } = link;
  const { toggleMute } = voice;
  // Panic = vent the cuff AND centre the stick, so the pull that caused it stops.
  // The sim also pauses (posting a steady 1.0 G) and its own G comes down to 1, so
  // nothing can jump the cuff back up when the burst ends. P resumes from 1 G.
  const { pause, calm } = flight;
  const panic = useCallback(() => {
    panicVent();
    release();
    pause();
  }, [panicVent, release, pause]);
  // Restoring the link must not hand the cuff whatever G the sim reached meanwhile.
  const toggleKillSafely = useCallback(() => {
    if (link.killed) calm();
    toggleKill();
  }, [link.killed, calm, toggleKill]);

  // M mode, R restart, P / Esc pause, K kill link, X panic vent, V voice.
  // Ctrl/Meta/Alt combos stay with the browser.
  const { toggleMode, restart, toggleRunning } = flight;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "KeyM") toggleMode();
      else if (e.code === "KeyR") restart();
      else if (e.code === "KeyP" || e.code === "Escape") toggleRunning();
      else if (e.code === "KeyK") toggleKillSafely();
      else if (e.code === "KeyX") panic();
      else if (e.code === "KeyV") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMode, restart, toggleRunning, toggleKillSafely, panic, toggleMute]);

  return (
    <>
      <Scene flight={flight} />
      <Hud
        state={hudState}
        running={flight.running}
        mode={flight.mode}
        cuffEnabled={cuffEnabled}
        onToggleRunning={flight.toggleRunning}
        onRestart={flight.restart}
        onToggleCuff={() => setCuffEnabled((v) => !v)}
      />
      <div className="overlay">
        <CuffPanel
          status={link.status}
          g={cuffG}
          onToggleKill={toggleKillSafely}
          onPanicVent={panic}
          muted={voice.muted}
          voiceSupported={voice.supported}
          onToggleMute={toggleMute}
        />
      </div>
    </>
  );
}
