import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db.js";
import { dateRange, startOfDay, today } from "../src/time.js";

const config = loadConfig({ ADMIN_PASSWORD: "clave-de-prueba", SESSION_SECRET: "secreto-de-prueba-123", DATA_DIR: ":memory:" });
const db = openDatabase(":memory:");
const server = createApp(config, db).listen(0);
let base = "";
let adminToken = "";

async function call(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: (await response.json()) as any };
}

before(() => {
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("day boundaries follow Chile time", () => {
  // 2026-10-02 in Santiago is UTC-3 (summer time).
  assert.equal(new Date(startOfDay("2026-10-02", "America/Santiago")).toISOString(), "2026-10-02T03:00:00.000Z");
  // 2026-06-15 is winter time, UTC-4.
  assert.equal(new Date(startOfDay("2026-06-15", "America/Santiago")).toISOString(), "2026-06-15T04:00:00.000Z");
  const [s, e] = dateRange("2026-10-01", "2026-10-02", "America/Santiago");
  assert.equal((e - s) / 3600_000, 48);
});

test("login rejects a wrong password and accepts the right one", async () => {
  assert.equal((await call("POST", "/api/login", { password: "nope" })).status, 401);
  const ok = await call("POST", "/api/login", { password: "clave-de-prueba" });
  assert.equal(ok.status, 200);
  adminToken = ok.body.token;
  assert.equal((await call("GET", "/api/admin/summary")).status, 401);
});

test("pair a phone, upload calls, and read today's summary", async () => {
  const created = await call("POST", "/api/admin/executives", { name: "Ana Pérez" }, adminToken);
  assert.equal(created.status, 201);
  const code: string = created.body.executive.pair_code;
  assert.match(code, /^[A-Z2-9]{6}$/);

  const paired = await call("POST", "/api/device/pair", { code: code.toLowerCase(), deviceModel: "Samsung A15" });
  assert.equal(paired.status, 200);
  assert.equal(paired.body.executiveName, "Ana Pérez");
  // The code is single-use.
  assert.equal((await call("POST", "/api/device/pair", { code })).status, 404);

  const now = Date.now();
  const calls = [
    { deviceCallId: "1", number: "+56911111111", type: "outgoing", startedAt: now - 60_000, durationSec: 125 },
    { deviceCallId: "2", number: "+56922222222", type: "outgoing", startedAt: now - 50_000, durationSec: 0 },
    { deviceCallId: "3", number: "+56911111111", type: "outgoing", startedAt: now - 40_000, durationSec: 35 },
    { deviceCallId: "4", number: "+56933333333", type: "incoming", startedAt: now - 30_000, durationSec: 60 },
    { deviceCallId: "5", number: "+56944444444", type: "missed", startedAt: now - 20_000, durationSec: 0 }
  ];
  assert.equal((await call("POST", "/api/device/calls", { calls }, "bad-token")).status, 401);
  const uploaded = await call("POST", "/api/device/calls", { calls }, paired.body.token);
  assert.equal(uploaded.status, 200);
  // Re-sending is idempotent.
  await call("POST", "/api/device/calls", { calls }, paired.body.token);

  const summary = await call("GET", `/api/admin/summary?from=${today(config.TIMEZONE)}`, undefined, adminToken);
  const ana = summary.body.executives.find((e: any) => e.name === "Ana Pérez");
  assert.deepEqual(
    {
      outgoing: ana.outgoing,
      answered: ana.outgoing_answered,
      unanswered: ana.outgoing_unanswered,
      incoming: ana.incoming,
      missed: ana.missed,
      talk: ana.talk_sec,
      outTalk: ana.outgoing_talk_sec,
      distinct: ana.distinct_numbers
    },
    { outgoing: 3, answered: 2, unanswered: 1, incoming: 1, missed: 1, talk: 220, outTalk: 160, distinct: 2 }
  );
  assert.ok(ana.last_sync_at);

  const detail = await call("GET", `/api/admin/executives/${ana.id}/calls`, undefined, adminToken);
  assert.equal(detail.body.calls.length, 5);

  // A new pairing code unlinks the old phone.
  await call("POST", `/api/admin/executives/${ana.id}/pair-code`, {}, adminToken);
  assert.equal((await call("POST", "/api/device/calls", { calls }, paired.body.token)).status, 401);
});
