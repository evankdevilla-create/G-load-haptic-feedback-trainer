/**
 * The bridge between the browser sim and the cuff.
 *
 * Why it exists: bridge.py already knows how to talk to the Arduino, and it
 * already carries the safety behaviour we rely on (clamping to 0..9 G, a steady
 * 20 Hz so the firmware's dead-man timer never trips by accident, reconnecting
 * when the USB drops, CSV logging). A browser cannot open a serial port without
 * duplicating all of that, and duplicating safety-critical code for a device
 * strapped to someone's leg is a bad trade.
 *
 * So this server pretends to be FlightGear. It answers on the same URL shape
 * FlightGear's --httpd serves, which means:
 *
 *     cd bridge && .venv/bin/python bridge.py --live
 *
 * works against the React sim with NO changes to bridge.py, the serial contract
 * or the firmware. The sim POSTs its G here, the bridge polls it as usual.
 *
 *     browser sim --POST /g--> this server --GET /json/...--> bridge.py --> Arduino
 *
 * THE IMPORTANT BIT - the stale guard:
 * If the browser tab freezes, is closed, or the laptop sleeps mid-pull, this
 * server must NOT keep cheerfully reporting 6 G, or the cuff would stay inflated
 * on someone's leg. So a reading older than STALE_MS is treated as a property
 * that does not exist (404). The bridge then sees no data, stops sending, and
 * the firmware's dead-man timer vents the cuff. The whole chain fails safe.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 5400);
/** Older than this and we refuse to report it. Must be under the firmware's
 *  500 ms dead-man window so the cuff vents promptly. */
const STALE_MS = Number(process.env.STALE_MS ?? 400);
/** Matches FlightGear: a lightly filtered companion to the raw value. */
const DAMPED_ALPHA = 0.25;

/** Largest G the sim can legitimately report. */
const MAX_G = 12;

/** Only the sim's own pages may talk to us from a browser: Vite dev ports and preview. */
const ALLOWED_ORIGINS = new Set();
for (const host of ["127.0.0.1", "localhost"]) {
  for (let p = 5173; p <= 5210; p++) ALLOWED_ORIGINS.add(`http://${host}:${p}`);
  ALLOWED_ORIGINS.add(`http://${host}:4173`);
}
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Host header must name us, or a rebound DNS name could reach this server. */
function hostOk(req) {
  const host = req.headers.host ?? "";
  return LOCAL_HOSTS.has(host.replace(/:\d+$/, ""));
}

const PROP_RAW = "/accelerations/pilot-g";
const PROP_DAMPED = "/accelerations/pilot-gdamped";

let current = null; // { g, damped, at, leg }
let wasLive = false;

/** FlightGear's JSON shape for a single property. */
function propertyBody(path, value) {
  return JSON.stringify({
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    value: Number(value.toFixed(4)),
    type: "double",
    index: 0,
    nChildren: 0,
  });
}

function send(res, status, body, type = "application/json") {
  const origin = res.req.headers.origin;
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body),
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function fresh() {
  if (!current) return null;
  if (Date.now() - current.at > STALE_MS) return null;
  return current;
}

/** Say something on the terminal when the link goes live or goes stale. */
function noteLiveness() {
  const live = fresh() !== null;
  if (live === wasLive) return;
  wasLive = live;
  console.log(
    live
      ? "  sim connected - serving G to the bridge"
      : `  sim went quiet (no update for ${STALE_MS} ms) - reporting the property as` +
          " absent so the cuff vents",
  );
}

/** A request (headers + body) must arrive within this, or the socket is dropped (slowloris). */
const READ_TIMEOUT_MS = 2000;

const server = createServer(
  { headersTimeout: READ_TIMEOUT_MS, requestTimeout: READ_TIMEOUT_MS, connectionsCheckingInterval: 500 },
  (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  const origin = req.headers.origin;
  if (!hostOk(req) || (origin !== undefined && !ALLOWED_ORIGINS.has(origin) && req.method !== "GET")) {
    send(res, 403, JSON.stringify({ error: "forbidden" }));
    return;
  }

  // The browser preflights the POST because it is a cross-origin JSON request.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  // --- the sim pushes its current G here -----------------------------------
  if (req.method === "POST" && url.pathname === "/g") {
    // A text/plain no-cors POST needs no preflight, so insist on real JSON.
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "application/json") {
      req.resume();
      send(res, 415, JSON.stringify({ error: "Content-Type must be application/json" }));
      return;
    }
    let raw = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 4096) {
        tooBig = true;
        req.destroy(); // nothing legitimate is this big
      }
    });
    req.on("end", () => {
      if (tooBig) return;
      try {
        const { g, leg } = JSON.parse(raw);
        if (typeof g !== "number" || !Number.isFinite(g) || g < 0 || g > MAX_G) {
          send(res, 400, JSON.stringify({ error: `g must be a number from 0 to ${MAX_G}` }));
          return;
        }
        const damped =
          current && Date.now() - current.at < 1000
            ? current.damped + DAMPED_ALPHA * (g - current.damped)
            : g;
        current = { g, damped, at: Date.now(), leg: typeof leg === "string" ? leg : null };
        noteLiveness();
        send(res, 200, JSON.stringify({ ok: true }));
      } catch {
        send(res, 400, JSON.stringify({ error: "expected JSON {g: number}" }));
      }
    });
    return;
  }

  // --- the bridge polls here, exactly as it polls FlightGear ---------------
  if (req.method === "GET" && url.pathname.startsWith("/json")) {
    const prop = url.pathname.slice("/json".length);
    const live = fresh();
    noteLiveness();
    if (!live) {
      // Deliberate: no fresh reading means "this property does not exist", which
      // is what makes the cuff vent instead of holding a stale squeeze.
      send(res, 404, JSON.stringify({ error: "no live G from the sim" }));
      return;
    }
    if (prop === PROP_RAW) return send(res, 200, propertyBody(PROP_RAW, live.g));
    if (prop === PROP_DAMPED) return send(res, 200, propertyBody(PROP_DAMPED, live.damped));
    send(res, 404, JSON.stringify({ error: `no such property: ${prop}` }));
    return;
  }

  // --- a human-readable peek, for debugging --------------------------------
  if (req.method === "GET" && url.pathname === "/status") {
    const live = fresh();
    send(
      res,
      200,
      JSON.stringify(
        {
          live: live !== null,
          g: live?.g ?? null,
          leg: live?.leg ?? null,
          ageMs: current ? Date.now() - current.at : null,
          staleAfterMs: STALE_MS,
          serving: [PROP_RAW, PROP_DAMPED],
        },
        null,
        2,
      ),
    );
    return;
  }

  send(res, 404, JSON.stringify({ error: "not found" }));
  },
);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`G server on http://127.0.0.1:${PORT}`);
  console.log(`  sim posts to      POST http://127.0.0.1:${PORT}/g`);
  console.log(`  bridge reads      GET  http://127.0.0.1:${PORT}/json${PROP_RAW}`);
  console.log(`  have a look       GET  http://127.0.0.1:${PORT}/status`);
  console.log("");
  console.log("Now run the bridge in another terminal:");
  console.log("  cd ../bridge && .venv/bin/python bridge.py --live --print");
  console.log("");
});
