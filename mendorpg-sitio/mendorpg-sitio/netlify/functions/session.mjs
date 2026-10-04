import { json, isAdmin } from "../lib/auth.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);
  return json({ admin: isAdmin(req) });
};

export const config = { path: "/api/session" };
