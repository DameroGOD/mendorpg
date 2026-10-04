// Trailer del reino: el administrador sube un video (MP4/WebM) que se guarda en pedazos de 4 MB.
// Flujo: POST ?action=start -> PUT ?action=chunk (uno por pedazo) -> POST ?action=finish.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { json, isAdmin, sameOrigin } from "../lib/auth.mjs";
import { CHUNK, MAX_BYTES } from "../lib/trailer.mjs";

const ID = /^[a-f0-9]{32}$/;

// Se mira el contenido real del archivo, no lo que diga el navegador.
function detectType(b) {
  if (b.length > 12 && b.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (b.length > 12 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}

async function dropChunks(store, keepId) {
  const { blobs } = await store.list({ prefix: "v-" });
  await Promise.all(blobs.filter((b) => !keepId || !b.key.startsWith(`v-${keepId}-`)).map((b) => store.delete(b.key)));
}

export default async (req) => {
  const store = getStore({ name: "trailer", consistency: "strong" });

  if (req.method === "GET") {
    const cur = await store.get("current", { type: "json" });
    return json({ trailer: cur ? { id: cur.id, type: cur.type, size: cur.size } : null });
  }

  if (!["POST", "PUT", "DELETE"].includes(req.method)) return json({ error: "Método no permitido" }, 405);
  if (!sameOrigin(req)) return json({ error: "Origen no permitido" }, 403);
  if (!isAdmin(req)) return json({ error: "No autorizado" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const meta = async (id) => (ID.test(id || "") ? store.get(`v-${id}-meta`, { type: "json" }) : null);

  if (req.method === "DELETE") {
    await store.delete("current");
    await dropChunks(store, null);
    return json({ ok: true, trailer: null });
  }

  if (req.method === "POST" && action === "start") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
    const size = Number(body?.size);
    if (!Number.isInteger(size) || size < 1) return json({ error: "Archivo vacío" }, 400);
    if (size > MAX_BYTES) return json({ error: `El video pesa demasiado (máximo ${MAX_BYTES / 1048576} MB)` }, 413);
    const cur = await store.get("current", { type: "json" });
    await dropChunks(store, cur?.id); // limpia subidas abandonadas
    const id = randomBytes(16).toString("hex");
    const n = Math.ceil(size / CHUNK);
    await store.setJSON(`v-${id}-meta`, { size, n });
    return json({ ok: true, id, chunk: CHUNK, n });
  }

  if (req.method === "PUT" && action === "chunk") {
    const id = url.searchParams.get("id");
    const i = Number(url.searchParams.get("i"));
    const m = await meta(id);
    if (!m) return json({ error: "La subida no está iniciada o venció. Volvé a empezar." }, 400);
    if (!Number.isInteger(i) || i < 0 || i >= m.n) return json({ error: "Pedazo inválido" }, 400);
    const ab = await req.arrayBuffer();
    const buf = Buffer.from(ab);
    const expected = i < m.n - 1 ? CHUNK : m.size - (m.n - 1) * CHUNK;
    if (buf.length !== expected) return json({ error: "El pedazo llegó incompleto. Reintentá." }, 400);
    if (i === 0 && !detectType(buf)) return json({ error: "Formato no permitido. Usá MP4 o WebM." }, 415);
    await store.set(`v-${id}-${i}`, ab);
    return json({ ok: true });
  }

  if (req.method === "POST" && action === "finish") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
    const id = body?.id;
    const m = await meta(id);
    if (!m) return json({ error: "Subida no encontrada" }, 400);
    const first = await store.get(`v-${id}-0`, { type: "arrayBuffer" });
    const type = first && detectType(Buffer.from(first));
    if (!type) return json({ error: "Formato no permitido. Usá MP4 o WebM." }, 415);
    const found = await Promise.all(Array.from({ length: m.n }, (_, i) => store.getMetadata(`v-${id}-${i}`)));
    if (found.some((x) => !x)) return json({ error: "Faltan pedazos del video. Volvé a subirlo." }, 400);
    await store.setJSON("current", { id, type, size: m.size, n: m.n, updated: new Date().toISOString() });
    await dropChunks(store, id); // borra el video anterior
    return json({ ok: true, trailer: { id, type, size: m.size } });
  }

  return json({ error: "Pedido inválido" }, 400);
};

export const config = { path: "/api/trailer" };
