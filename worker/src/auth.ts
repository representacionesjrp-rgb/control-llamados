import crypto from "node:crypto";

const ADMIN_SESSION_MS = 30 * 24 * 60 * 60_000;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Six characters without look-alikes (0/O, 1/I) so it is easy to type on the phone. */
export function randomPairCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function issueAdminToken(secret: string, now = Date.now()): string {
  const expires = String(now + ADMIN_SESSION_MS);
  const signature = crypto.createHmac("sha256", secret).update(`admin:${expires}`).digest("base64url");
  return `${expires}.${signature}`;
}

export function verifyAdminToken(token: string, secret: string, now = Date.now()): boolean {
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < now) return false;
  const expected = crypto.createHmac("sha256", secret).update(`admin:${expires}`).digest("base64url");
  return safeEqual(signature, expected);
}
