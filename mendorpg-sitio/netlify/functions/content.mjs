// Textos y enlaces de la página que el administrador cambió con el lápiz.
// Se guarda como { texts: { "texto original": "texto nuevo" }, links: { "url original": "url nueva" } }
import { getStore } from "@netlify/blobs";
import { json, isAdmin, sameOrigin } from "../lib/auth.mjs";

const MAX_KEYS = 600;
const MAX_LEN = 2000;
const SAFE_URL = /^(https?:\/\/|mailto:|\/|#)/i;

function sanitize(body) {
  const out = { texts: {}, links: {} };
  const texts = body?.texts && typeof body.texts === "object" ? body.texts : {};
  const links = body?.links && typeof body.links === "object" ? body.links : {};
  const tk = Object.keys(texts);
  const lk = Object.keys(links);
  if (tk.length + lk.length > MAX_KEYS) throw new Error("Demasiados cambios");
  for (const k of tk) {
    const v = String(texts[k] ?? "").trim();
    if (!k || k.length > MAX_LEN || v.length > MAX_LEN) throw new Error("Texto demasiado largo");
    if (v) out.texts[k] = v;
  }
  for (const k of lk) {
    const v = String(links[k] ?? "").trim();
    if (!k || k.length > MAX_LEN || v.length > MAX_LEN) throw new Error("Enlace demasiado largo");
    if (v && !SAFE_URL.test(v)) throw new Error("Los enlaces deben empezar con https://, http://, mailto:, / o #");
    if (v) out.links[k] = v;
  }
  return out;
}

export default async (req) => {
  const store = getStore({ name: "mendorpg", consistency: "strong" });

  if (req.method === "GET") {
    const content = await store.get("content", { type: "json" });
    return json({ content: content ?? { texts: {}, links: {} } });
  }

  if (req.method === "PUT") {
    if (!sameOrigin(req)) return json({ error: "Origen no permitido" }, 403);
    if (!isAdmin(req)) return json({ error: "No autorizado" }, 401);
    let content;
    try {
      content = sanitize(await req.json());
    } catch (e) {
      return json({ error: e.message || "Pedido inválido" }, 400);
    }
    await store.setJSON("content", content);
    return json({ ok: true, content });
  }

  return json({ error: "Método no permitido" }, 405);
};

export const config = { path: "/api/content" };
