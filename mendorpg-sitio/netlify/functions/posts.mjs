// Crónicas del reino: publicaciones tipo blog (título + texto en Markdown + imagen opcional).
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { json, isAdmin, sameOrigin } from "../lib/auth.mjs";

const MAX_POSTS = 500;
const IMG_ID = /^[a-f0-9]{32}$/;
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function cleanPost(b) {
  const titulo = clean(b?.titulo, 160);
  if (!titulo) throw new Error("Falta el título");
  const cuerpo = String(b?.cuerpo ?? "").replace(/\r\n/g, "\n").trim().slice(0, 20000);
  const fecha = validDate(b?.fecha) ? b.fecha : today();
  const imagen = b?.imagen ? String(b.imagen) : null;
  if (imagen && !IMG_ID.test(imagen)) throw new Error("Imagen inválida");
  return { titulo, cuerpo, fecha, imagen };
}

const sortPosts = (list) =>
  list.sort((a, b) => (a.fecha === b.fecha ? (b.creado || "").localeCompare(a.creado || "") : b.fecha.localeCompare(a.fecha)));

async function dropIfUnused(images, posts, id) {
  if (id && !posts.some((p) => p.imagen === id)) {
    try { await images.delete(id); } catch { /* no pasa nada si ya no existe */ }
  }
}

export default async (req) => {
  const store = getStore({ name: "mendorpg", consistency: "strong" });
  const images = getStore({ name: "imagenes", consistency: "strong" });

  if (req.method === "GET") {
    const posts = (await store.get("posts", { type: "json" })) ?? [];
    return json({ posts });
  }

  if (!["POST", "PUT", "DELETE"].includes(req.method)) return json({ error: "Método no permitido" }, 405);
  if (!sameOrigin(req)) return json({ error: "Origen no permitido" }, 403);
  if (!isAdmin(req)) return json({ error: "No autorizado" }, 401);

  let posts = (await store.get("posts", { type: "json" })) ?? [];

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    const found = posts.find((p) => p.id === id);
    if (!found) return json({ error: "No existe esa publicación" }, 404);
    posts = posts.filter((p) => p.id !== id);
    await store.setJSON("posts", posts);
    await dropIfUnused(images, posts, found.imagen);
    return json({ ok: true, posts });
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }

  let data;
  try { data = cleanPost(body); } catch (e) { return json({ error: e.message }, 400); }
  if (data.imagen) {
    const meta = await images.getMetadata(data.imagen);
    if (!meta) return json({ error: "La imagen no existe en el servidor. Volvé a subirla." }, 400);
  }

  if (req.method === "POST") {
    if (posts.length >= MAX_POSTS) return json({ error: "Se alcanzó el máximo de publicaciones" }, 400);
    posts.push({ id: randomUUID(), ...data, creado: new Date().toISOString() });
  } else {
    const i = posts.findIndex((p) => p.id === body?.id);
    if (i < 0) return json({ error: "No existe esa publicación" }, 404);
    const oldImg = posts[i].imagen;
    posts[i] = { ...posts[i], ...data, editado: new Date().toISOString() };
    if (oldImg && oldImg !== data.imagen) await dropIfUnused(images, posts, oldImg);
  }
  sortPosts(posts);
  await store.setJSON("posts", posts);
  return json({ ok: true, posts });
};

export const config = { path: "/api/posts" };
