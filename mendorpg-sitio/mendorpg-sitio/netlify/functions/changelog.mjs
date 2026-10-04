import { getStore } from "@netlify/blobs";
import { json, isAdmin, sameOrigin } from "../lib/auth.mjs";

const MAX_ENTRIES = 200;
const MAX_CHANGES = 40;

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Valida y limpia lo que manda el panel; nunca confiamos en el navegador.
function sanitize(list) {
  if (!Array.isArray(list) || list.length > MAX_ENTRIES) throw new Error("Lista inválida");
  return list.map((e) => {
    const cambios = (Array.isArray(e?.cambios) ? e.cambios : [])
      .slice(0, MAX_CHANGES)
      .map((c) => clean(c, 300))
      .filter(Boolean);
    const entry = { version: clean(e?.version, 40), fecha: clean(e?.fecha, 60), titulo: clean(e?.titulo, 140), cambios };
    if (!entry.version && !entry.titulo && !cambios.length) throw new Error("Hay una entrada vacía");
    return entry;
  });
}

export default async (req) => {
  const store = getStore({ name: "mendorpg", consistency: "strong" });

  if (req.method === "GET") {
    // Público: lo ve cualquier visitante. entries = null significa "todavía no se guardó nada".
    const entries = await store.get("changelog", { type: "json" });
    return json({ entries: entries ?? null });
  }

  if (req.method === "PUT") {
    if (!sameOrigin(req)) return json({ error: "Origen no permitido" }, 403);
    if (!isAdmin(req)) return json({ error: "No autorizado" }, 401);
    let entries;
    try {
      entries = sanitize((await req.json())?.entries);
    } catch (e) {
      return json({ error: e.message || "Pedido inválido" }, 400);
    }
    await store.setJSON("changelog", entries);
    return json({ ok: true, entries });
  }

  return json({ error: "Método no permitido" }, 405);
};

export const config = { path: "/api/changelog" };
