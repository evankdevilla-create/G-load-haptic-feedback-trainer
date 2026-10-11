/** Key reference. Read-only: flight keys are handled elsewhere, never here. */

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
  const manual = mode === "manual";
  const m: [string, string] = ["M", manual ? "autopilot" : "fly manually"];
  const rows = manual ? [...FLY_KEYS, m, ...COMMON_KEYS] : [m, ...COMMON_KEYS];
  return (
    <ul className="keyhints" aria-label="Keyboard controls">
      {rows.map(([k, v]) => (
        <li key={k}>
          <kbd>{k}</kbd> {v}
        </li>
      ))}
    </ul>
  );
}
