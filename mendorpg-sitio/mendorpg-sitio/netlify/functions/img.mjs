// Entrega las imágenes subidas. Es pública: la ve cualquier visitante.
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "GET") return new Response("Método no permitido", { status: 405 });
  const id = context?.params?.id || new URL(req.url).pathname.split("/").pop();
  if (!/^[a-f0-9]{32}$/.test(id || "")) return new Response("No encontrada", { status: 404 });
  const images = getStore({ name: "imagenes", consistency: "strong" });
  const res = await images.getWithMetadata(id, { type: "arrayBuffer" });
  if (!res) return new Response("No encontrada", { status: 404 });
  const ct = res.metadata?.contentType;
  if (!["image/jpeg", "image/png", "image/webp"].includes(ct)) return new Response("No encontrada", { status: 404 });
  return new Response(res.data, {
    headers: {
      "content-type": ct,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
};

export const config = { path: "/api/img/:id" };
