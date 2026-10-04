// Entrega el video del trailer (público). Soporta "Range" para poder adelantar/retroceder y para Safari/iPhone.
import { getStore } from "@netlify/blobs";
import { CHUNK } from "../lib/trailer.mjs";

export default async (req, context) => {
  if (req.method !== "GET") return new Response("Método no permitido", { status: 405 });
  const id = context?.params?.id || new URL(req.url).pathname.split("/").pop();
  const store = getStore({ name: "trailer", consistency: "strong" });
  const cur = await store.get("current", { type: "json" });
  if (!/^[a-f0-9]{32}$/.test(id || "") || !cur || cur.id !== id) return new Response("No encontrado", { status: 404 });

  const { size, type } = cur;
  let start = 0, end = size - 1, partial = false;
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get("range") || "").trim());
  if (m && (m[1] !== "" || m[2] !== "")) {
    if (m[1] === "") { start = Math.max(0, size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== "") end = Math.min(Number(m[2]), size - 1); }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    partial = true;
  }
  // Una respuesta de función no puede pasar de ~6 MB: se entrega en tramos de hasta 4 MB (el navegador pide el resto solo).
  if (end - start + 1 > CHUNK) { end = start + CHUNK - 1; partial = true; }

  const first = Math.floor(start / CHUNK), last = Math.floor(end / CHUNK);
  const parts = await Promise.all(Array.from({ length: last - first + 1 }, (_, k) => store.get(`v-${id}-${first + k}`, { type: "arrayBuffer" })));
  if (parts.some((p) => !p)) return new Response("No encontrado", { status: 404 });
  const all = Buffer.concat(parts.map((p) => Buffer.from(p)));
  const body = all.subarray(start - first * CHUNK, start - first * CHUNK + (end - start + 1));

  const headers = {
    "content-type": type,
    "content-length": String(body.length),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
  };
  if (partial) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: partial ? 206 : 200, headers });
};

export const config = { path: "/api/trailer/video/:id" };
