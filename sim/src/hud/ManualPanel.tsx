/** Key reference. Read-only: flight keys are handled elsewhere, never here. */

import type { FlightMode } from "../flight/types";

const FLY_KEYS: Array<[string, string]> = [
  ["S / W", "pull / push"],
  ["A / D", "roll"],
  ["Shift / Q", "throttle"],
  ["Space", "recentre"],
];

const OTHER_KEYS: Array<[string, string]> = [
  ["M", "manual / auto"],
  ["P", "pause"],
  ["R", "restart"],
];

export function KeyHints({ mode }: { mode: FlightMode }) {
  const rows = mode === "manual" ? [...FLY_KEYS, ...OTHER_KEYS] : OTHER_KEYS;
  return (
    <ul className="panel keyhints" aria-label="Keyboard controls">
      {rows.map(([k, v]) => (
        <li key={k}>
          <kbd>{k}</kbd> {v}
        </li>
      ))}
    </ul>
  );
}
