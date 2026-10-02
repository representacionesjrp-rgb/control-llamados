import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import { hashToken, issueAdminToken, randomPairCode, randomToken, safeEqual, verifyAdminToken } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { Executive } from "./db.js";
import { AppError } from "./errors.js";
import { dateRange, today } from "./time.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const callSchema = z.object({
  deviceCallId: z.string().min(1).max(64),
  number: z.string().max(64).default(""),
  contactName: z.string().max(200).nullish(),
  type: z.enum(["outgoing", "incoming", "missed", "rejected", "blocked", "voicemail", "other"]),
  startedAt: z.number().int().positive(),
  durationSec: z.number().int().min(0).max(24 * 3600)
});

type Handler = (request: Request, response: Response) => unknown;
const wrap = (handler: Handler) => async (request: Request, response: Response, next: NextFunction) => {
  try {
    await handler(request, response);
  } catch (error) {
    next(error);
  }
};

function bearer(request: Request): string {
  const header = request.header("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function createApp(config: AppConfig, db: DatabaseSync, publicDir?: string) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: { directives: { "script-src": ["'self'"] } } }));
  app.use(express.json({ limit: "2mb" }));

  const failedLogins = new Map<string, { count: number; resetAt: number }>();

  app.get("/health", (_request, response) => response.json({ ok: true }));

  // ---------- Admin (manager dashboard) ----------

  app.post(
    "/api/login",
    wrap((request, response) => {
      const key = request.ip || "unknown";
      const now = Date.now();
      const previous = failedLogins.get(key);
      if (previous && previous.resetAt > now && previous.count >= 8) {
        throw new AppError(429, "TOO_MANY_ATTEMPTS", "Demasiados intentos. Espera 15 minutos.");
      }
      const { password } = z.object({ password: z.string() }).parse(request.body);
      if (!safeEqual(password, config.ADMIN_PASSWORD)) {
        const current = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + 15 * 60_000 };
        current.count += 1;
        failedLogins.set(key, current);
        throw new AppError(401, "BAD_PASSWORD", "Contraseña incorrecta.");
      }
      failedLogins.delete(key);
      response.json({ ok: true, token: issueAdminToken(config.SESSION_SECRET) });
    })
  );

  const admin = express.Router();
  admin.use((request, _response, next) => {
    if (!verifyAdminToken(bearer(request), config.SESSION_SECRET)) {
      return next(new AppError(401, "UNAUTHORIZED", "Sesion expirada. Vuelve a ingresar."));
    }
    next();
  });

  admin.get("/executives", (_request, response) => {
    const rows = db
      .prepare("SELECT id, name, pair_code, device_model, last_sync_at, created_at FROM executives ORDER BY name")
      .all() as unknown as Executive[];
    response.json({ ok: true, executives: rows });
  });

  admin.post(
    "/executives",
    wrap((request, response) => {
      const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
      const code = randomPairCode();
      const result = db
        .prepare("INSERT INTO executives (name, pair_code, created_at) VALUES (?, ?, ?)")
        .run(name, code, Date.now());
      response.status(201).json({ ok: true, executive: { id: Number(result.lastInsertRowid), name, pair_code: code } });
    })
  );

  admin.post(
    "/executives/:id/pair-code",
    wrap((request, response) => {
      const id = z.coerce.number().int().parse(request.params.id);
      const code = randomPairCode();
      const result = db
        .prepare("UPDATE executives SET pair_code = ?, device_token_hash = NULL, device_model = NULL WHERE id = ?")
        .run(code, id);
      if (result.changes === 0) throw new AppError(404, "NOT_FOUND", "Ejecutivo no encontrado.");
      response.json({ ok: true, pair_code: code });
    })
  );

  admin.delete(
    "/executives/:id",
    wrap((request, response) => {
      const id = z.coerce.number().int().parse(request.params.id);
      db.prepare("DELETE FROM executives WHERE id = ?").run(id);
      response.json({ ok: true });
    })
  );

  function rangeFromQuery(request: Request): { from: string; to: string; start: number; end: number } {
    const query = z
      .object({ from: dateSchema.optional(), to: dateSchema.optional() })
      .parse(request.query);
    const from = query.from ?? today(config.TIMEZONE);
    const to = query.to ?? from;
    const [start, end] = dateRange(from, to, config.TIMEZONE);
    return { from, to, start, end };
  }

  admin.get(
    "/summary",
    wrap((request, response) => {
      const { from, to, start, end } = rangeFromQuery(request);
      const rows = db
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
        .all(start, end);
      response.json({ ok: true, from, to, timezone: config.TIMEZONE, generatedAt: Date.now(), executives: rows });
    })
  );

  admin.get(
    "/executives/:id/calls",
    wrap((request, response) => {
      const id = z.coerce.number().int().parse(request.params.id);
      const { from, to, start, end } = rangeFromQuery(request);
      const executive = db.prepare("SELECT id, name, device_model, last_sync_at FROM executives WHERE id = ?").get(id);
      if (!executive) throw new AppError(404, "NOT_FOUND", "Ejecutivo no encontrado.");
      const calls = db
        .prepare(
          `SELECT number, contact_name, type, started_at, duration_sec FROM calls
           WHERE executive_id = ? AND started_at >= ? AND started_at < ?
           ORDER BY started_at DESC LIMIT 2000`
        )
        .all(id, start, end);
      response.json({ ok: true, from, to, timezone: config.TIMEZONE, executive, calls });
    })
  );

  app.use("/api/admin", admin);

  // ---------- Device (executive's Android phone) ----------

  app.post(
    "/api/device/pair",
    wrap((request, response) => {
      const input = z
        .object({ code: z.string().trim().toUpperCase(), deviceModel: z.string().max(100).optional() })
        .parse(request.body);
      const executive = db.prepare("SELECT id, name FROM executives WHERE pair_code = ?").get(input.code) as
        | { id: number; name: string }
        | undefined;
      if (!executive) throw new AppError(404, "BAD_CODE", "Codigo invalido o ya usado. Pide uno nuevo al administrador.");
      const token = randomToken();
      db.prepare("UPDATE executives SET pair_code = NULL, device_token_hash = ?, device_model = ? WHERE id = ?").run(
        hashToken(token),
        input.deviceModel ?? null,
        executive.id
      );
      response.json({ ok: true, token, executiveName: executive.name });
    })
  );

  app.post(
    "/api/device/calls",
    wrap((request, response) => {
      const token = bearer(request);
      const executive = token
        ? (db.prepare("SELECT id FROM executives WHERE device_token_hash = ?").get(hashToken(token)) as
            | { id: number }
            | undefined)
        : undefined;
      if (!executive) throw new AppError(401, "UNPAIRED", "Este telefono ya no esta vinculado. Ingresa un codigo nuevo.");
      const { calls } = z.object({ calls: z.array(callSchema).max(1000) }).parse(request.body);
      const now = Date.now();
      const upsert = db.prepare(
        `INSERT INTO calls (executive_id, device_call_id, number, contact_name, type, started_at, duration_sec, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (executive_id, device_call_id) DO UPDATE SET
           contact_name = excluded.contact_name, type = excluded.type, duration_sec = excluded.duration_sec`
      );
      db.exec("BEGIN");
      try {
        for (const call of calls) {
          upsert.run(executive.id, call.deviceCallId, call.number, call.contactName ?? null, call.type, call.startedAt, call.durationSec, now);
        }
        db.prepare("UPDATE executives SET last_sync_at = ? WHERE id = ?").run(now, executive.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      response.json({ ok: true, received: calls.length });
    })
  );

  if (publicDir && fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));
  }

  app.use("/api", (_request, _response, next) => next(new AppError(404, "NOT_FOUND", "Ruta no encontrada.")));

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof AppError) {
      response.status(error.status).json({ ok: false, code: error.code, message: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      response.status(400).json({ ok: false, code: "INVALID_INPUT", message: "Datos invalidos." });
      return;
    }
    console.error(error);
    response.status(500).json({ ok: false, code: "INTERNAL", message: "Error interno." });
  };
  app.use(errorHandler);

  return app;
}

