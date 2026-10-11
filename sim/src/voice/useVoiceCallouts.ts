import { useCallback, useEffect, useRef, useState } from "react";
import { CALLOUT_TEXT, initialCalloutState, nextCallout } from "./callouts";
import type { CalloutId } from "./callouts";
import { CLIP_URLS } from "./clips";

const SAMPLE_MS = 100;

const synth = (): SpeechSynthesis | undefined => {
  try {
    return typeof window !== "undefined" ? window.speechSynthesis : undefined;
  } catch {
    return undefined;
  }
};

function cancelSpeech(audio?: HTMLAudioElement | null) {
  try {
    synth()?.cancel();
  } catch {
    /* ignore */
  }
  try {
    audio?.pause();
  } catch {
    /* ignore */
  }
}

export function useVoiceCallouts(
  getG: () => number,
  running: boolean,
): { muted: boolean; toggleMute: () => void; supported: boolean } {
  const [muted, setMuted] = useState(false);
  const supported = synth() !== undefined;
  const mutedRef = useRef(muted);
  const getGRef = useRef(getG);
  const runningRef = useRef(running);
  const interacted = useRef(false);
  const calloutState = useRef(initialCalloutState());
  const audio = useRef<HTMLAudioElement | null>(null);
  mutedRef.current = muted;
  getGRef.current = getG;
  runningRef.current = running;

  const speak = useCallback((id: CalloutId) => {
    cancelSpeech(audio.current);
    try {
      const url = CLIP_URLS[id];
      if (url) {
        const a = new Audio(url);
        audio.current = a;
        void a.play().catch(() => {});
        return;
      }
      const s = synth();
      if (s) s.speak(new SpeechSynthesisUtterance(CALLOUT_TEXT[id]));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onInteract = () => {
      interacted.current = true;
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("pointerdown", onInteract);
    };
    const stop = () => cancelSpeech(audio.current);
    const onHidden = () => document.hidden && stop();
    window.addEventListener("keydown", onInteract);
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", onHidden);

    const timer = setInterval(() => {
      try {
        const r = nextCallout(calloutState.current, getGRef.current(), performance.now(), runningRef.current);
        calloutState.current = r.state;
        // The state machine advances even when silenced, so unmuting doesn't replay stale callouts.
        if (r.callout && !mutedRef.current && interacted.current) speak(r.callout);
      } catch {
        /* ignore */
      }
    }, SAMPLE_MS);

    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", onHidden);
      stop();
    };
  }, [speak]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) cancelSpeech(audio.current);
      return !m;
    });
  }, []);

  return { muted, toggleMute, supported };
}
