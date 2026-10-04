// Subida de imágenes para las crónicas (solo administradores).
import { getStore } from "@netlify/blobs";
import { json, isAdmin, sameOrigin, sha } from "../lib/auth.mjs";

const MAX_BYTES = 4 * 1024 * 1024;

// Se mira el contenido real del archivo, no lo que diga el navegador.
function detectType(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  if (!sameOrigin(req)) return json({ error: "Origen no permitido" }, 403);
  if (!isAdmin(req)) return json({ error: "No autorizado" }, 401);

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return json({ error: "Archivo vacío" }, 400);
  if (buf.length > MAX_BYTES) return json({ error: "La imagen pesa demasiado (máximo 4 MB)" }, 413);
  const type = detectType(buf);
  if (!type) return json({ error: "Formato no permitido. Usá JPG, PNG o WebP." }, 415);

  const id = sha(buf.toString("base64")).slice(0, 32);
  const images = getStore({ name: "imagenes", consistency: "strong" });
  await images.set(id, buf, { metadata: { contentType: type } });
  return json({ ok: true, id, url: `/api/img/${id}` });
};

export const config = { path: "/api/upload" };
