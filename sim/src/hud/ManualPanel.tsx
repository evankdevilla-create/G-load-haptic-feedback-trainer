/** Key reference. Read-only: flight keys are handled elsewhere, never here. */

import { useState } from "react";
import type { FlightMode } from "../flight/types";

const FLY_KEYS: Array<[string, string]> = [
  ["S/W", "pitch"],
  ["A/D", "roll"],
  ["Shift/Q", "throttle"],
  ["Space", "centre"],
];

const COMMON_KEYS: Array<[string, string]> = [
  ["C", "camera"],
  ["V", "voice callouts"],
  ["P", "pause"],
  ["R", "restart"],
  ["K", "kill link"],
  ["X", "panic vent"],
];

export function KeyHints({ mode }: { mode: FlightMode }) {
  const [open, setOpen] = useState(false);
  const manual = mode === "manual";
  const m: [string, string] = ["M", manual ? "autopilot" : "fly manually"];
  const compact = [
    ...(manual ? ["S/W pitch", "A/D roll"] : []),
    "C camera",
    `M ${m[1]}`,
    "K kill link",
    "X panic vent",
  ].join(" · ");
  const rows = manual ? [...FLY_KEYS, m, ...COMMON_KEYS] : [m, ...COMMON_KEYS];
  return (
    <div className="panel keyhints" role="group" aria-label="Keyboard controls">
      <div className="keyhints-line">
        <span>{compact}</span>
        <button
          className="interactive keyhints-toggle"
          aria-expanded={open}
          aria-controls="keyhints-full"
          aria-label="All keyboard controls"
          onClick={(e) => {
            setOpen(!open);
            e.currentTarget.blur(); // keep Space/arrows flying
          }}
        >
          ?
        </button>
      </div>
      {open && (
        <ul id="keyhints-full">
          {rows.map(([k, v]) => (
            <li key={k}>
              <kbd>{k}</kbd> {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
