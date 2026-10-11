Optional pre-rendered voice clips for the G callouts.

Drop mp3 files here named after the callout id:
  g2.mp3  g4.mp3  g6.mp3  unload.mp3  level.mp3  push.mp3

Then register each one in src/voice/clips.ts, e.g.
  export const CLIP_URLS = { g6: "/voice/g6.mp3" };

Any callout without a registered clip is spoken by the browser's built-in
speech synthesis (text lives in CALLOUT_TEXT in src/voice/callouts.ts).
