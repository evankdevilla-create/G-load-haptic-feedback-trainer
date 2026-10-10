/**
 * Pushes the sim's live G to the cuff.
 *
 * The path is deliberately boring:
 *
 *   this hook --POST /g--> server/g-server.mjs --GET /json/...--> bridge.py --> Arduino
 *
 * The browser never touches the serial port. bridge.py already clamps G to the
 * range the firmware accepts, keeps a steady 20 Hz so the dead-man timer does
 * not trip, reconnects when the USB drops and logs everything to CSV. Rewriting
 * that in a tab, for a pump strapped to someone's leg, would be a bad trade.
 *
 * Two safety details:
 *
 *  - We post at 20 Hz, comfortably inside the g-server's 400 ms stale window.
 *    If this tab freezes or closes, the server starts reporting the property as
 *    absent, the bridge stops sending, and the firmware vents the cuff.
 *  - While paused we keep posting a steady 1.0 G rather than going silent. 1 G
 *    is an empty cuff, so pausing mid-pull releases the squeeze, and the link
 *    stays visibly up instead of looking like a crash.
 *  - Same treatment if the physics has STALLED. Browsers suspend
 *    requestAnimationFrame in a background tab but keep timers running, so
 *    without this check a backgrounded tab would keep posting the last G it
 *    managed to compute. Caught in testing: the sortie froze mid-turn and the
 *    bridge received 916 consecutive lines of exactly 4.00 G, which on real
 *    hardware is a cuff held at a 4 G squeeze until someone noticed.
 */

import { useEffect, useRef, useState } from "react";
import type { FlightState, Route } from "../flight/types";

export type CuffStatus = "offline" | "connecting" | "live";

export const DEFAULT_CUFF_URL = "http://127.0.0.1:5400/g";

/** G reported while the sim is paused or stalled. 1 G = empty cuff. */
const PAUSED_G = 1.0;
const POST_HZ = 20;
/**
 * Physics should advance every animation frame (~16 ms). If it has not advanced
 * for this long, the tab is throttled or wedged and the state is not live.
 */
const STALL_MS = 250;

export interface CuffLink {
  status: CuffStatus;
  /** Last transport error, for the HUD to show. */
  error: string | null;
  /** How many posts the server has accepted. */
  accepted: number;
  /** True when the physics has stopped advancing and we are holding at 1 G. */
  stalled: boolean;
}

export function useCuffLink(
  stateRef: React.RefObject<FlightState>,
  lastStepAtRef: React.RefObject<number>,
  route: Route,
  options: { enabled: boolean; running: boolean; url?: string },
): CuffLink {
  const { enabled, running, url = DEFAULT_CUFF_URL } = options;
  const [status, setStatus] = useState<CuffStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(0);
  const [stalled, setStalled] = useState(false);

  // Read inside the interval without restarting it on every render.
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (!enabled) {
      setStatus("offline");
      setError(null);
      return;
    }

    setStatus("connecting");
    let cancelled = false;
    let inFlight = false;
    let ok = 0;

    const id = setInterval(() => {
      // Never queue posts behind a slow one: a backlog would deliver stale G.
      if (inFlight) return;
      inFlight = true;

      const s = stateRef.current;
      // Only send live G. A frozen simulation must not hold the cuff inflated.
      const isStalled = performance.now() - lastStepAtRef.current > STALL_MS;
      setStalled(isStalled);
      const g = runningRef.current && !isStalled ? s.g : PAUSED_G;
      const leg = isStalled ? "sim stalled" : (route.legs[s.legIndex]?.label ?? "complete");

      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ g, leg }),
      })
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            ok += 1;
            setAccepted(ok);
            setStatus("live");
            setError(null);
          } else {
            setStatus("connecting");
            setError(`server said ${res.status}`);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setStatus("connecting");
          setError("no g-server on " + url + " - run: npm run gserver");
        })
        .finally(() => {
          inFlight = false;
        });
    }, 1000 / POST_HZ);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, url, route, stateRef, lastStepAtRef]);

  return { status, error, accepted, stalled };
}
