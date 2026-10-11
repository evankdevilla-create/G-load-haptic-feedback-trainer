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

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_ROUTE } from "./flight/route";
import { useFlight, useSampled } from "./flight/useFlight";
import { usePilotInput } from "./input/usePilotInput";
import { CuffPanel } from "./hud/CuffPanel";
import { Hud } from "./hud/Hud";
import { Scene } from "./scene/Scene";
import type { CameraView } from "./scene/Scene";
import { useCuffLink } from "./telemetry/useCuffLink";
import { useVoiceCallouts } from "./voice/useVoiceCallouts";

export function App() {
  const route = DEMO_ROUTE;
  const pilot = usePilotInput();
  const flight = useFlight(route, pilot);
  // ?cuff=off starts with the cuff link disabled, ?view=cockpit starts in the cockpit view (chase is the default).
  // Both exist so screenshots and tests can run the sim without driving a real cuff.
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [cuffEnabled, setCuffEnabled] = useState(params.get("cuff") !== "off");
  const [view, setView] = useState<CameraView>(params.get("view") === "cockpit" ? "cockpit" : "chase");

  const link = useCuffLink(flight.stateRef, flight.lastStepAtRef, route, {
    enabled: cuffEnabled,
    running: flight.running,
  });

  const voice = useVoiceCallouts(() => (link.killed ? 1 : flight.stateRef.current.g), flight.running);

  // The physics runs at 100 Hz but React only needs to redraw the HUD at 20.
  const hudState = useSampled(() => flight.stateRef.current, 20);

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
      else if (e.code === "KeyC") setView((v) => (v === "cockpit" ? "chase" : "cockpit"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMode, restart, toggleRunning, toggleKillSafely, panic, toggleMute]);

  return (
    <>
      <Scene flight={flight} view={view} />
      <Hud
        state={hudState}
        running={flight.running}
        mode={flight.mode}
        view={view}
        getRenderState={flight.renderState}
        cuffEnabled={cuffEnabled}
        onToggleRunning={flight.toggleRunning}
        onRestart={flight.restart}
        onToggleCuff={() => setCuffEnabled((v) => !v)}
      />
      <div className="overlay">
        <CuffPanel
          status={link.status}
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
