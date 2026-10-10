/**
 * Everything drawn over the 3D view: instruments, route progress, and the state
 * of the link to the cuff.
 */

import type { Track } from "../flight/track";
import type { FlightState, Route } from "../flight/types";
import type { CuffLink } from "../telemetry/useCuffLink";
import { GMeter } from "./GMeter";
import { GProfile } from "./GProfile";
import { RouteMap } from "./RouteMap";

const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

function Readout({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="readout">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="unit">{unit}</div>
    </div>
  );
}

function CuffBadge({ link, enabled }: { link: CuffLink; enabled: boolean }) {
  const text = !enabled
    ? "CUFF OFF"
    : link.stalled
      ? "SIM STALLED - HOLDING 1 G"
      : link.status === "live"
        ? "CUFF LINK LIVE"
        : link.status === "connecting"
          ? "CUFF LINK WAITING"
          : "CUFF OFF";
  const cls =
    !enabled || link.status === "offline"
      ? "badge off"
      : link.stalled
        ? "badge waiting"
        : link.status === "live"
          ? "badge live"
          : "badge waiting";

  return (
    <div className={cls} title={link.error ?? undefined}>
      <span className="dot" />
      {text}
      {enabled && link.status !== "live" && link.error ? (
        <div className="badge-note">{link.error}</div>
      ) : null}
    </div>
  );
}

export function Hud({
  state,
  route,
  track,
  link,
  cuffEnabled,
  running,
  looping,
  onToggleRunning,
  onRestart,
  onToggleLooping,
  onToggleCuff,
}: {
  state: FlightState;
  route: Route;
  track: Track;
  link: CuffLink;
  cuffEnabled: boolean;
  running: boolean;
  looping: boolean;
  onToggleRunning: () => void;
  onRestart: () => void;
  onToggleLooping: () => void;
  onToggleCuff: () => void;
}) {
  const leg = route.legs[state.legIndex];
  const legSeconds = leg?.seconds ?? 0;
  const legProgress = legSeconds > 0 ? Math.min(1, state.legElapsed / legSeconds) : 1;
  const routeProgress = Math.min(1, state.t / Math.max(track.duration, 1));
  const headingDeg = ((state.psi * 180) / Math.PI + 360) % 360;

  return (
    <div className="overlay">
      {/* Top left: where we are in the route. */}
      <div className="panel top-left">
        <div className="route-name">{route.name}</div>
        <div className="leg">
          <span className="leg-index">
            {Math.min(state.legIndex + 1, route.legs.length)}/{route.legs.length}
          </span>
          <span className="leg-label">{leg?.label ?? "Route complete"}</span>
        </div>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${legProgress * 100}%` }} />
        </div>
        <div className="bar total">
          <div className="bar-fill" style={{ width: `${routeProgress * 100}%` }} />
        </div>
        <div className="muted">
          T+{state.t.toFixed(1)} s of {track.duration.toFixed(0)} s &middot;{" "}
          {(state.distance / 1000).toFixed(1)} km flown
        </div>
      </div>

      {/* Top right: the G meter and the cuff. */}
      <div className="panel top-right">
        <GMeter g={state.g} commanded={state.gCommanded} limited={state.gLimited} />
        <CuffBadge link={link} enabled={cuffEnabled} />
      </div>

      {/* Bottom left: the plan view. */}
      <div className="panel bottom-left">
        <RouteMap track={track} x={state.pos.x} z={state.pos.z} headingRad={state.psi} />
      </div>

      {/* Bottom centre: flight instruments, sitting on the glareshield. */}
      <div className="panel instruments">
        <Readout label="IAS" value={(state.v * MS_TO_KT).toFixed(0)} unit="kt" />
        <Readout label="ALT" value={(state.pos.y * M_TO_FT).toFixed(0)} unit="ft" />
        <Readout label="HDG" value={headingDeg.toFixed(0).padStart(3, "0")} unit="deg" />
        <Readout
          label="BANK"
          value={((state.phi * 180) / Math.PI).toFixed(0)}
          unit="deg"
        />
        <Readout
          label="PITCH"
          value={(((state.gamma + state.alpha) * 180) / Math.PI).toFixed(0)}
          unit="deg"
        />
      </div>

      {/* Bottom right: the scripted G profile. */}
      <div className="panel bottom-right">
        <GProfile track={track} t={state.t} />
      </div>

      {/* Controls. */}
      <div className="panel controls interactive">
        <button onClick={onToggleRunning}>{running ? "Pause" : "Fly"}</button>
        <button onClick={onRestart}>Restart</button>
        <button onClick={onToggleLooping} aria-pressed={looping}>
          Loop
        </button>
        <button onClick={onToggleCuff} aria-pressed={cuffEnabled}>
          Cuff
        </button>
      </div>
    </div>
  );
}
