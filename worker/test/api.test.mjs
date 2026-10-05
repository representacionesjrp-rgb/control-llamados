// Runs against a live worker: start it with `pnpm dev` (uses .dev.vars), then `BASE=http://127.0.0.1:8787 pnpm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.BASE ?? "http://127.0.0.1:8787";
const password = process.env.ADMIN_PASSWORD ?? "clave-de-prueba";

async function call(method, path, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test("pair a phone, upload calls, and read today's summary", async () => {
  assert.equal((await call("POST", "/api/login", { password: "nope" })).status, 401);
  const login = await call("POST", "/api/login", { password });
  assert.equal(login.status, 200);
  const admin = login.body.token;
  assert.equal((await call("GET", "/api/admin/summary")).status, 401);

  const name = `Prueba ${Date.now()}`;
  const created = await call("POST", "/api/admin/executives", { name }, admin);
  assert.equal(created.status, 201);
  const code = created.body.executive.pair_code;
  const paired = await call("POST", "/api/device/pair", { code: code.toLowerCase(), deviceModel: "Pixel" });
  assert.equal(paired.status, 200);
  assert.equal((await call("POST", "/api/device/pair", { code })).status, 404);

  const now = Date.now();
  const calls = [
    { deviceCallId: "1", number: "+56911111111", contactName: "Cliente Uno", type: "outgoing", startedAt: now - 60_000, durationSec: 125 },
    { deviceCallId: "2", number: "+56922222222", type: "outgoing", startedAt: now - 50_000, durationSec: 0, waitSec: 15 },
    { deviceCallId: "3", number: "+56911111111", type: "outgoing", startedAt: now - 40_000, durationSec: 35 },
    { deviceCallId: "4", number: "+56933333333", type: "incoming", startedAt: now - 30_000, durationSec: 60 },
    { deviceCallId: "5", number: "+56944444444", type: "missed", startedAt: now - 20_000, durationSec: 0 }
  ];
  assert.equal((await call("POST", "/api/device/calls", { calls }, "bad")).status, 401);
  assert.equal((await call("POST", "/api/device/calls", { calls }, paired.body.token)).status, 200);
  // Re-sending is idempotent and updates the duration; a resend without the wait time keeps it.
  calls[1].durationSec = 0;
  delete calls[1].waitSec;
  assert.equal((await call("POST", "/api/device/calls", { calls }, paired.body.token)).status, 200);
  assert.equal((await call("POST", "/api/device/calls", { calls: [] }, paired.body.token)).status, 200);

  // A large batch fits in a single request.
  const many = Array.from({ length: 600 }, (_, i) => ({ deviceCallId: `m${i}`, number: "+5690000", type: "outgoing", startedAt: now - 100_000 - i, durationSec: 10 }));
  assert.equal((await call("POST", "/api/device/calls", { calls: many.slice(0, 500) }, paired.body.token)).status, 200);

  const summary = await call("GET", "/api/admin/summary", undefined, admin);
  const row = summary.body.executives.find((e) => e.name === name);
  assert.deepEqual(
    [row.outgoing, row.outgoing_answered, row.outgoing_unanswered, row.incoming, row.missed, row.talk_sec, row.distinct_numbers],
    [503, 502, 1, 1, 1, 220 + 5000, 3]
  );

  const detail = await call("GET", `/api/admin/executives/${row.id}/calls`, undefined, admin);
  assert.equal(detail.body.calls.length, 505);
  assert.equal(detail.body.calls.find((c) => c.number === "+56911111111" && c.duration_sec === 125).contact_name, "Cliente Uno");

  const mine = await call("GET", `/api/admin/calls?exec=${row.id}&limit=50000`, undefined, admin);
  assert.equal(mine.body.total, 505);
  assert.equal(mine.body.calls.length, 505);
  assert.equal(mine.body.calls[0].executive_name, name);
  const noAnswer = await call("GET", `/api/admin/calls?exec=${row.id}&type=noans`, undefined, admin);
  assert.equal(noAnswer.body.total, 1);
  assert.equal(noAnswer.body.calls[0].ring_sec, 15);
  assert.equal(mine.body.calls.find((c) => c.duration_sec === 125).ring_sec, null);
  const limited = await call("GET", `/api/admin/calls?exec=${row.id}&limit=10`, undefined, admin);
  assert.equal(limited.body.calls.length, 10);
  assert.equal(limited.body.total, 505);

  // Older months stay queryable: a call 100 days ago shows up in its own range.
  const old = now - 100 * 86_400_000;
  await call("POST", "/api/device/calls", { calls: [{ deviceCallId: "old1", number: "+569", type: "outgoing", startedAt: old, durationSec: 30 }] }, paired.body.token);
  const day = new Date(old - 4 * 3600_000).toISOString().slice(0, 10);
  const oldRange = await call("GET", `/api/admin/calls?exec=${row.id}&from=${day}&to=${day}`, undefined, admin);
  assert.equal(oldRange.body.total, 1);

  await call("POST", `/api/admin/executives/${row.id}/pair-code`, {}, admin);
  assert.equal((await call("POST", "/api/device/calls", { calls }, paired.body.token)).status, 401);
  assert.equal((await call("DELETE", `/api/admin/executives/${row.id}`, undefined, admin)).status, 200);
});

test("serves the dashboard", async () => {
  const response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Control de llamados/);
});
