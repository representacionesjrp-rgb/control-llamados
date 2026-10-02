import { z } from "zod";
import { createHash } from "node:crypto";
import { hashToken, issueAdminToken, randomPairCode, randomToken, safeEqual, verifyAdminToken } from "./auth";
import { dateRange, today } from "./time";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  /** Optional: when missing, sessions are signed with a key derived from ADMIN_PASSWORD. */
  SESSION_SECRET?: string;
  TIMEZONE?: string;
}

class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const callSchema = z.object({
  deviceCallId: z.string().min(1).max(64),
  number: z.string().max(64).default(""),
  contactName: z.string().max(200).nullish(),
  type: z.enum(["outgoing", "incoming", "missed", "rejected", "blocked", "voicemail", "other"]),
  startedAt: z.number().int().positive(),
  durationSec: z.number().int().min(0).max(24 * 3600)
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function body(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "INVALID_INPUT", "Datos invalidos.");
  }
}

// Best effort per isolate; Cloudflare may run several isolates.
const failedLogins = new Map<string, { count: number; resetAt: number }>();

function sessionSecret(env: Env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  return createHash("sha256").update(`control-llamados:${env.ADMIN_PASSWORD}`).digest("hex");
}

async function route(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_PASSWORD) throw new AppError(500, "NOT_CONFIGURED", "Falta configurar ADMIN_PASSWORD.");
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const tz = env.TIMEZONE || "America/Santiago";
  const db = env.DB;

  if (path === "/health") return json({ ok: true });

  if (method === "POST" && path === "/api/login") {
    const key = request.headers.get("cf-connecting-ip") ?? "unknown";
    const now = Date.now();
    const previous = failedLogins.get(key);
    if (previous && previous.resetAt > now && previous.count >= 8) {
      throw new AppError(429, "TOO_MANY_ATTEMPTS", "Demasiados intentos. Espera 15 minutos.");
    }
    const { password } = z.object({ password: z.string() }).parse(await body(request));
    if (!safeEqual(password, env.ADMIN_PASSWORD)) {
      const current = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + 15 * 60_000 };
      current.count += 1;
      failedLogins.set(key, current);
      throw new AppError(401, "BAD_PASSWORD", "Contraseña incorrecta.");
    }
    failedLogins.delete(key);
    return json({ ok: true, token: issueAdminToken(sessionSecret(env)) });
  }

  // ---------- Device (executive's Android phone) ----------

  if (method === "POST" && path === "/api/device/pair") {
    const input = z
      .object({ code: z.string().trim().toUpperCase(), deviceModel: z.string().max(100).optional() })
      .parse(await body(request));
    const executive = await db
      .prepare("SELECT id, name FROM executives WHERE pair_code = ?")
      .bind(input.code)
      .first<{ id: number; name: string }>();
    if (!executive) throw new AppError(404, "BAD_CODE", "Codigo invalido o ya usado. Pide uno nuevo al administrador.");
    const token = randomToken();
    await db
      .prepare("UPDATE executives SET pair_code = NULL, device_token_hash = ?, device_model = ? WHERE id = ?")
      .bind(hashToken(token), input.deviceModel ?? null, executive.id)
      .run();
    return json({ ok: true, token, executiveName: executive.name });
  }

  if (method === "POST" && path === "/api/device/calls") {
    const token = bearer(request);
    const executive = token
      ? await db.prepare("SELECT id FROM executives WHERE device_token_hash = ?").bind(hashToken(token)).first<{ id: number }>()
      : null;
    if (!executive) throw new AppError(401, "UNPAIRED", "Este telefono ya no esta vinculado. Ingresa un codigo nuevo.");
    const { calls } = z.object({ calls: z.array(callSchema).max(1000) }).parse(await body(request));
    const now = Date.now();
    // One statement for the whole batch: D1's free plan allows 50 queries per request and 100 bound values per query.
    const rows = JSON.stringify(
      calls.map((c) => [c.deviceCallId, c.number, c.contactName ?? null, c.type, c.startedAt, c.durationSec])
    );
    await db.batch([
      db
        .prepare(
          `INSERT INTO calls (executive_id, device_call_id, number, contact_name, type, started_at, duration_sec, received_at)
           SELECT ?1, value ->> 0, value ->> 1, value ->> 2, value ->> 3, value ->> 4, value ->> 5, ?2
           FROM json_each(?3) WHERE true
           ON CONFLICT (executive_id, device_call_id) DO UPDATE SET
             contact_name = excluded.contact_name, type = excluded.type, duration_sec = excluded.duration_sec`
        )
        .bind(executive.id, now, rows),
      db.prepare("UPDATE executives SET last_sync_at = ? WHERE id = ?").bind(now, executive.id)
    ]);
    return json({ ok: true, received: calls.length });
  }

  // ---------- Admin (manager dashboard) ----------

  if (path.startsWith("/api/admin/")) {
    if (!verifyAdminToken(bearer(request), sessionSecret(env))) {
      throw new AppError(401, "UNAUTHORIZED", "Sesion expirada. Vuelve a ingresar.");
    }
    const sub = path.slice("/api/admin".length);
    const range = () => {
      const q = z
        .object({ from: dateSchema.optional(), to: dateSchema.optional() })
        .parse(Object.fromEntries(url.searchParams));
      const from = q.from ?? today(tz);
      const to = q.to ?? from;
      const [start, end] = dateRange(from, to, tz);
      return { from, to, start, end };
    };

    if (method === "GET" && sub === "/executives") {
      const { results } = await db
        .prepare("SELECT id, name, pair_code, device_model, last_sync_at, created_at FROM executives ORDER BY name")
        .all();
      return json({ ok: true, executives: results });
    }

    if (method === "POST" && sub === "/executives") {
      const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(await body(request));
      const code = randomPairCode();
      const result = await db
        .prepare("INSERT INTO executives (name, pair_code, created_at) VALUES (?, ?, ?)")
        .bind(name, code, Date.now())
        .run();
      return json({ ok: true, executive: { id: result.meta.last_row_id, name, pair_code: code } }, 201);
    }

    const codeMatch = sub.match(/^\/executives\/(\d+)\/pair-code$/);
    if (method === "POST" && codeMatch) {
      const code = randomPairCode();
      const result = await db
        .prepare("UPDATE executives SET pair_code = ?, device_token_hash = NULL, device_model = NULL WHERE id = ?")
        .bind(code, Number(codeMatch[1]))
        .run();
      if (result.meta.changes === 0) throw new AppError(404, "NOT_FOUND", "Ejecutivo no encontrado.");
      return json({ ok: true, pair_code: code });
    }

    const execMatch = sub.match(/^\/executives\/(\d+)$/);
    if (method === "DELETE" && execMatch) {
      const id = Number(execMatch[1]);
      await db.batch([
        db.prepare("DELETE FROM calls WHERE executive_id = ?").bind(id),
        db.prepare("DELETE FROM executives WHERE id = ?").bind(id)
      ]);
      return json({ ok: true });
    }

    if (method === "GET" && sub === "/summary") {
      const { from, to, start, end } = range();
      const { results } = await db
        .prepare(
          `SELECT e.id, e.name, e.device_model, e.last_sync_at, e.pair_code,
             COALESCE(SUM(c.type = 'outgoing'), 0) AS outgoing,
             COALESCE(SUM(c.type = 'outgoing' AND c.duration_sec > 0), 0) AS outgoing_answered,
             COALESCE(SUM(c.type = 'outgoing' AND c.duration_sec = 0), 0) AS outgoing_unanswered,
             COALESCE(SUM(c.type = 'incoming'), 0) AS incoming,
             COALESCE(SUM(c.type IN ('missed', 'rejected')), 0) AS missed,
             COALESCE(SUM(c.duration_sec), 0) AS talk_sec,
             COALESCE(SUM(CASE WHEN c.type = 'outgoing' THEN c.duration_sec ELSE 0 END), 0) AS outgoing_talk_sec,
             COUNT(DISTINCT CASE WHEN c.type = 'outgoing' THEN c.number END) AS distinct_numbers,
             MIN(c.started_at) AS first_call_at,
             MAX(c.started_at) AS last_call_at
           FROM executives e
           LEFT JOIN calls c ON c.executive_id = e.id AND c.started_at >= ? AND c.started_at < ?
           GROUP BY e.id
           ORDER BY outgoing DESC, e.name`
        )
        .bind(start, end)
        .all();
      return json({ ok: true, from, to, timezone: tz, generatedAt: Date.now(), executives: results });
    }

    const callsMatch = sub.match(/^\/executives\/(\d+)\/calls$/);
    if (method === "GET" && callsMatch) {
      const id = Number(callsMatch[1]);
      const { from, to, start, end } = range();
      const executive = await db
        .prepare("SELECT id, name, device_model, last_sync_at FROM executives WHERE id = ?")
        .bind(id)
        .first();
      if (!executive) throw new AppError(404, "NOT_FOUND", "Ejecutivo no encontrado.");
      const { results } = await db
        .prepare(
          `SELECT number, contact_name, type, started_at, duration_sec FROM calls
           WHERE executive_id = ? AND started_at >= ? AND started_at < ?
           ORDER BY started_at DESC LIMIT 2000`
        )
        .bind(id, start, end)
        .all();
      return json({ ok: true, from, to, timezone: tz, executive, calls: results });
    }
  }

  throw new AppError(404, "NOT_FOUND", "Ruta no encontrada.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== "/health" && !path.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof AppError) return json({ ok: false, code: error.code, message: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ ok: false, code: "INVALID_INPUT", message: "Datos invalidos." }, 400);
      console.error(error);
      return json({ ok: false, code: "INTERNAL", message: "Error interno." }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
