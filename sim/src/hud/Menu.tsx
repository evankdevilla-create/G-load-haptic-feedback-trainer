/**
 * The hamburger menu, top left. Everything that used to sit in its own box (the
 * key reference, pause/restart/cuff, and the cuff safety buttons) lives here, so
 * the flight view stays clear. The keyboard shortcuts (K, X, V, P, R, C, M) work
 * with the menu closed.
 */

import { useEffect, useRef, useState } from "react";
import type { FlightMode } from "../flight/types";
import type { CuffDisplayStatus } from "../telemetry/useCuffLink";
import { CuffPanel } from "./CuffPanel";
import { KeyHints } from "./ManualPanel";

export interface MenuProps {
  mode: FlightMode;
  running: boolean;
  cuffEnabled: boolean;
  onToggleRunning: () => void;
  onRestart: () => void;
  onToggleCuff: () => void;
  cuffStatus: CuffDisplayStatus;
  onToggleKill: () => void;
  onPanicVent: () => void;
  muted: boolean;
  voiceSupported: boolean;
  onToggleMute: () => void;
}

export function Menu(p: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Click outside closes it. No key handler: Escape/Space/letters belong to flight.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const killed = p.cuffStatus === "killed";
  return (
    <div className="menu interactive" ref={root}>
      <button
        className="menu-btn"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="menu-panel"
        onClick={(e) => {
          setOpen(!open);
          e.currentTarget.blur(); // keep Space/arrows flying
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        {killed && <span className="menu-flag">LINK KILLED</span>}
      </button>
      {open && (
        <div id="menu-panel" className="panel menu-panel" role="menu">
          <h2>Flight</h2>
          <div className="row">
            <button
              onClick={(e) => {
                p.onToggleRunning();
                e.currentTarget.blur();
              }}
            >
              {p.running ? "Pause" : "Fly"} <kbd>P</kbd>
            </button>
            <button
              onClick={(e) => {
                p.onRestart();
                e.currentTarget.blur();
              }}
            >
              Restart <kbd>R</kbd>
            </button>
            <button
              onClick={(e) => {
                p.onToggleCuff();
                e.currentTarget.blur();
              }}
              aria-pressed={p.cuffEnabled}
            >
              Cuff link
            </button>
          </div>
          <h2>Cuff safety</h2>
          <CuffPanel
            status={p.cuffStatus}
            onToggleKill={p.onToggleKill}
            onPanicVent={p.onPanicVent}
            muted={p.muted}
            voiceSupported={p.voiceSupported}
            onToggleMute={p.onToggleMute}
          />
          <h2>Keys</h2>
          <KeyHints mode={p.mode} />
        </div>
      )}
    </div>
  );
}
