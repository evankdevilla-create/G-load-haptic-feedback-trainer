// @ts-nocheck (no @types/node in this project; this test spawns the node server)
import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { connect, createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let proc: ChildProcess;
let port = 0;

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

type Res = { status: number; body: string; headers: Record<string, unknown> };

function call(
  method: string,
  path: string,
  opts: { body?: string; headers?: Record<string, string> } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, method, path, headers: opts.headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      },
    );
    req.on("error", reject);
    req.end(opts.body);
  });
}

const post = (body: string, headers: Record<string, string> = {}) =>
  call("POST", "/g", { body, headers: { "Content-Type": "application/json", ...headers } });
const OK_ORIGIN = "http://localhost:5173";

beforeAll(async () => {
  port = await freePort();
  proc = spawn("node", ["server/g-server.mjs"], {
    env: { ...process.env, PORT: String(port), STALE_MS: "300" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((resolve) => proc.stdout!.on("data", (d) => d.toString().includes("G server on") && resolve()));
});

afterAll(() => {
  proc.kill();
});

describe("g-server", () => {
  it("accepts a post from the sim's own origin and echoes it, not *", async () => {
    const r = await post('{"g":3.5}', { Origin: OK_ORIGIN });
    expect(r.status).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBe(OK_ORIGIN);
  });

  it("accepts the vite preview and 127.0.0.1 origins", async () => {
    expect((await post('{"g":1}', { Origin: "http://127.0.0.1:4173" })).status).toBe(200);
    expect((await post('{"g":1}', { Origin: "http://127.0.0.1:5210" })).status).toBe(200);
  });

  it("accepts a post with no Origin header (curl, bridge)", async () => {
    const r = await post('{"g":2}');
    expect(r.status).toBe(200);
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it.each(["http://evil.example", "http://localhost:9999", "http://localhost:5211", "https://localhost:5173", "null"])(
    "rejects a cross-origin post from %s with 403",
    async (origin) => {
      expect((await post('{"g":6}', { Origin: origin })).status).toBe(403);
    },
  );

  it("rejects a preflight from an unknown origin", async () => {
    const r = await call("OPTIONS", "/g", { headers: { Origin: "http://evil.example" } });
    expect(r.status).toBe(403);
  });

  it("rejects a non-local Host header (DNS rebinding)", async () => {
    expect((await post('{"g":6}', { Host: "evil.example" })).status).toBe(403);
    expect((await call("GET", "/status", { headers: { Host: "evil.example:5400" } })).status).toBe(403);
  });

  it("accepts localhost and 127.0.0.1 Host headers", async () => {
    expect((await call("GET", "/status", { headers: { Host: `localhost:${port}` } })).status).toBe(200);
  });

  it.each([
    ['{"g":NaN}', "NaN literal"],
    ['{"g":"6"}', "string"],
    ['{"g":null}', "null"],
    ['{"g":1e999}', "Infinity"],
    ['{"g":13}', "above 12"],
    ['{"g":1000000}', "huge"],
    ['{"g":-0.5}', "negative"],
    ["not json", "garbage"],
  ])("rejects bad g %s (%s) with 400", async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("accepts the bounds 0 and 12", async () => {
    expect((await post('{"g":0}')).status).toBe(200);
    expect((await post('{"g":12}')).status).toBe(200);
  });

  it("rejects an oversized body and keeps the old reading", async () => {
    await post('{"g":2}');
    const big = JSON.stringify({ g: 6, pad: "x".repeat(5000) });
    const out = await post(big).then(
      (r) => r.status,
      () => "dropped",
    );
    expect(out === "dropped" || out === 413 || out === 400).toBe(true);
    const s = JSON.parse((await call("GET", "/status")).body);
    expect(s.g).toBe(2);
  });

  it("stale rule: property 404s once the last post is older than STALE_MS", async () => {
    await post('{"g":4}');
    expect((await call("GET", "/json/accelerations/pilot-g")).status).toBe(200);
    await new Promise((r) => setTimeout(r, 450));
    expect((await call("GET", "/json/accelerations/pilot-g")).status).toBe(404);
  });

  it("requires Content-Type application/json on POST /g (415)", async () => {
    expect((await post('{"g":3}', { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await post('{"g":3}', { "Content-Type": "text/plain", Origin: OK_ORIGIN })).status).toBe(415);
    expect((await post('{"g":3}', { "Content-Type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await post('{"g":3}', { "Content-Type": "application/json; charset=utf-8" })).status).toBe(200);
  });

  it("rejects a no-cors text/plain post from an evil origin and does not store it", async () => {
    await post('{"g":2}');
    const r = await post('{"g":9}', { "Content-Type": "text/plain", Origin: "http://evil.example" });
    expect([403, 415]).toContain(r.status);
    expect(JSON.parse((await call("GET", "/status")).body).g).toBe(2);
  });

  it("accepts valid JSON from the allowed origin", async () => {
    const r = await post('{"g":5}', { Origin: OK_ORIGIN });
    expect(r.status).toBe(200);
    expect(JSON.parse((await call("GET", "/status")).body).g).toBe(5);
  });

  it("never sends Access-Control-Allow-Origin: *", async () => {
    const rs = [
      await call("GET", "/status"),
      await call("GET", "/status", { headers: { Origin: "http://evil.example" } }),
      await call("GET", "/nope", { headers: { Origin: OK_ORIGIN } }),
      await call("OPTIONS", "/g"),
      await call("OPTIONS", "/g", { headers: { Origin: OK_ORIGIN } }),
      await call("OPTIONS", "/g", { headers: { Origin: "http://evil.example" } }),
      await post('{"g":1}', { Origin: "http://evil.example" }),
      await post("junk", { Origin: OK_ORIGIN }),
    ];
    for (const r of rs) expect(r.headers["access-control-allow-origin"]).not.toBe("*");
    expect(rs[3].headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("drops a slowloris client that never finishes its headers", async () => {
    const closed = await new Promise<boolean>((resolve) => {
      const s = connect(port, "127.0.0.1", () => s.write("POST /g HTTP/1.1\r\nHost: localhost\r\n"));
      s.on("close", () => resolve(true));
      s.on("data", (d) => String(d).includes(" 408 ") && resolve(true)); // server timed us out
      s.on("error", () => {});
      setTimeout(() => (s.destroy(), resolve(false)), 5000);
    });
    expect(closed).toBe(true);
  }, 8000);

  it("drops a client that sends headers but trickles the body", async () => {
    const closed = await new Promise<boolean>((resolve) => {
      const s = connect(port, "127.0.0.1", () => {
        s.write("POST /g HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 50\r\n\r\n{");
      });
      s.on("close", () => resolve(true));
      s.on("data", (d) => String(d).includes(" 408 ") && resolve(true));
      s.on("error", () => {});
      setTimeout(() => (s.destroy(), resolve(false)), 5000);
    });
    expect(closed).toBe(true);
  }, 8000);
});
