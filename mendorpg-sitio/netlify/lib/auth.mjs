// Utilidades de autenticación compartidas por las funciones.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "mendo_session";
export const SESSION_SECONDS = 8 * 60 * 60; // la sesión dura 8 horas

const b64u = (s) => Buffer.from(s).toString("base64url");

export function signToken(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

export function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function isAdmin(req) {
  const p = verifyToken(readCookie(req, COOKIE), process.env.SESSION_SECRET);
  return !!(p && p.role === "admin");
}

// Compara dos textos sin filtrar información por tiempo de respuesta.
export function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// Rechaza pedidos que vengan de otro sitio web (protección CSRF).
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(req.url).origin;
}

export function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
