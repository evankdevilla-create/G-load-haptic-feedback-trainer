/**
 * The cuff safety buttons, and nothing else.
 * Buttons are blurred after use so Space/arrows keep flying; no key handlers here.
 * The kill button reads "Restore link" while the link is killed, so its label
 * is the only state shown.
 */

import type { MouseEvent } from "react";
import type { CuffDisplayStatus } from "../telemetry/useCuffLink";

// keeps focus off the button so flight keys (Space) never re-trigger it
const release = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.blur();

export function CuffPanel({
  status,
  onToggleKill,
  onPanicVent,
  muted,
  voiceSupported,
  onToggleMute,
}: {
  status: CuffDisplayStatus;
  onToggleKill: () => void;
  onPanicVent: () => void;
  muted: boolean;
  voiceSupported: boolean;
  onToggleMute: () => void;
}) {
  const killed = status === "killed";

  return (
    <section className="panel cuff-panel interactive" aria-label="Cuff controls" data-status={status}>
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
            Voice callouts <kbd>V</kbd>
          </button>
        )}
      </div>
    </section>
  );
}
