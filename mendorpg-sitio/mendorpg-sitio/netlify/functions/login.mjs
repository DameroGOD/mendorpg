import { getStore } from "@netlify/blobs";
import { json, safeEqual, sameOrigin, signToken, cookieHeader, sha, SESSION_SECONDS } from "../lib/auth.mjs";

const MAX_FAILS = 5; // intentos fallidos permitidos
const WINDOW_MS = 15 * 60 * 1000; // por cada 15 minutos
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!sameOrigin(req)) return json({ error: "Origen no permitido" }, 403);

  const { ADMIN_USER, ADMIN_PASS, SESSION_SECRET } = process.env;
  if (!ADMIN_USER || !ADMIN_PASS || !SESSION_SECRET) {
    console.error("Faltan variables de entorno: ADMIN_USER, ADMIN_PASS y/o SESSION_SECRET");
    return json({ error: "El login todavía no está configurado en el servidor." }, 500);
  }

  // Límite de intentos por IP
  const store = getStore({ name: "seguridad", consistency: "strong" });
  const key = "login-" + sha(context?.ip || req.headers.get("x-nf-client-connection-ip") || "desconocida").slice(0, 32);
  const now = Date.now();
  let rec = (await store.get(key, { type: "json" })) || { n: 0, t: now };
  if (now - rec.t > WINDOW_MS) rec = { n: 0, t: now };
  if (rec.n >= MAX_FAILS) {
    const mins = Math.max(1, Math.ceil((rec.t + WINDOW_MS - now) / 60000));
    return json({ error: `Demasiados intentos. Probá de nuevo en ${mins} min.` }, 429);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const user = String(body?.user ?? "").slice(0, 200);
  const pass = String(body?.pass ?? "").slice(0, 200);

  const okUser = safeEqual(user, ADMIN_USER);
  const okPass = safeEqual(pass, ADMIN_PASS);
  if (!(okUser && okPass)) {
    await store.setJSON(key, { n: rec.n + 1, t: rec.t });
    await sleep(600);
    return json({ error: "Usuario o contraseña incorrectos." }, 401);
  }

  await store.delete(key);
  const token = signToken({ role: "admin", exp: Math.floor(now / 1000) + SESSION_SECONDS }, SESSION_SECRET);
  return json({ ok: true }, 200, { "set-cookie": cookieHeader(token, SESSION_SECONDS) });
};

export const config = { path: "/api/login" };
