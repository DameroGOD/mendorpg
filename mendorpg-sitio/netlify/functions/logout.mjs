import { json, sameOrigin, cookieHeader } from "../lib/auth.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!sameOrigin(req)) return json({ error: "Origen no permitido" }, 403);
  return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });
};

export const config = { path: "/api/logout" };
