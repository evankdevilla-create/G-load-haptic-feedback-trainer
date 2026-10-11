/**
 * Cuff link status and the safety buttons.
 * Buttons are blurred after use so Space/arrows keep flying; no key handlers here.
 */

import type { MouseEvent } from "react";
import { commandedFill, fillLabel } from "../cuff/cuffModel";
import type { CuffDisplayStatus } from "../telemetry/useCuffLink";

const STATUS_TEXT: Record<CuffDisplayStatus, string> = {
  live: "Cuff live",
  connecting: "Connecting",
  offline: "No cuff, sim only",
  killed: "Link killed, venting",
};

// keeps focus off the button so flight keys (Space) never re-trigger it
const release = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.blur();

export function CuffPanel({
  status,
  g,
  onToggleKill,
  onPanicVent,
  muted,
  voiceSupported,
  onToggleMute,
}: {
  status: CuffDisplayStatus;
  g: number;
  onToggleKill: () => void;
  onPanicVent: () => void;
  muted: boolean;
  voiceSupported: boolean;
  onToggleMute: () => void;
}) {
  const killed = status === "killed";
  const fill = Math.max(0, Math.min(1, commandedFill(g)));

  return (
    <section className="panel cuff-panel interactive" aria-label="Cuff status" data-status={status}>
      <div className="cuff-status" role="status">
        {STATUS_TEXT[status]}
      </div>
      <div className="cuff-fill-row">
        <div
          className="cuffbar"
          role="meter"
          aria-label="Commanded cuff fill"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill * 100)}
        >
          <div className="cuffbar-fill" style={{ transform: `scaleX(${killed ? 0 : fill})` }} />
        </div>
        <span className="cuff-fill-val">{killed ? "vent" : fillLabel(fill)}</span>
      </div>
      <div className="row">
        <button
          aria-label={killed ? "Restore bridge link (K)" : "Kill bridge link (K)"}
          onClick={(e) => {
            onToggleKill();
            release(e);
          }}
        >
          {killed ? "Restore link" : "Kill link"} <kbd>K</kbd>
        </button>
        <button
          className="danger"
          aria-label="Panic vent, deflate cuff now (X)"
          onClick={(e) => {
            onPanicVent();
            release(e);
          }}
        >
          Panic vent <kbd>X</kbd>
        </button>
        {voiceSupported && (
          <button
            aria-pressed={!muted}
            aria-label={muted ? "Voice is muted, turn on (V)" : "Voice is on, mute (V)"}
            onClick={(e) => {
              onToggleMute();
              release(e);
            }}
          >
            Voice <kbd>V</kbd>
          </button>
        )}
      </div>
    </section>
  );
}
