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

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlightState, Route } from "../flight/types";
import { gToPost } from "../cuff/postPolicy";

export type CuffStatus = "offline" | "connecting" | "live";
/** What the UI shows; "killed" (operator pulled the link) wins over the rest. */
export type CuffDisplayStatus = CuffStatus | "killed";

export const DEFAULT_CUFF_URL = "http://127.0.0.1:5400/g";

const POST_HZ = 20;
/**
 * Physics should advance every animation frame (~16 ms). If it has not advanced
 * for this long, the tab is throttled or wedged and the state is not live.
 */
const STALL_MS = 250;

export interface CuffLink {
  status: CuffDisplayStatus;
  /** Last transport error, for the HUD to show. */
  error: string | null;
  /** How many posts the server has accepted. */
  accepted: number;
  /** True when the physics has stopped advancing and we are holding at 1 G. */
  stalled: boolean;
  /** True while killed: nothing is posted, so the cuff vents via the dead-man path. */
  killed: boolean;
  kill: () => void;
  restore: () => void;
  toggleKill: () => void;
  /** Burst 1.0 G now, then resume normal behaviour (stays killed if killed). */
  panicVent: () => void;
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

  const [killed, setKilled] = useState(false);
  const killedRef = useRef(false);
  const urlRef = useRef(url);
  urlRef.current = url;

  const kill = useCallback(() => {
    killedRef.current = true;
    setKilled(true);
  }, []);
  const restore = useCallback(() => {
    killedRef.current = false;
    setKilled(false);
  }, []);
  const toggleKill = useCallback(() => {
    killedRef.current = !killedRef.current;
    setKilled(killedRef.current);
  }, []);
  // Panic = kill the link. Posting 1.0 G is NOT a vent: the firmware holds its
  // preload at 1 G. Only silence trips the dead-man, which vents all the way to
  // empty. K restores the link afterwards.
  const panicVent = useCallback(() => {
    killedRef.current = true;
    setKilled(true);
  }, []);

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
      // Killed: post nothing. The g-server goes stale, the bridge stops, the firmware vents.
      if (killedRef.current) return;
      // Never queue posts behind a slow one: a backlog would deliver stale G.
      if (inFlight) return;
      inFlight = true;

      const s = stateRef.current;
      // Only send live G. A frozen simulation must not hold the cuff inflated.
      const isStalled = performance.now() - lastStepAtRef.current > STALL_MS;
      setStalled(isStalled);
      const g = gToPost(s.g, {
        running: runningRef.current,
        stalled: isStalled,
        killed: killedRef.current,
        panic: false, // panic now kills the link instead (see panicVent)
      });
      if (g === null) {
        inFlight = false;
        return;
      }
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

  const display: CuffDisplayStatus = killed ? "killed" : status;
  return { status: display, error, accepted, stalled, killed, kill, restore, toggleKill, panicVent };
}
