"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { EventType, NewsKind } from "@/lib/types";

// Publicación de noticias y eventos (Sprint 4 T9). Arquitectura §3.2: toda
// escritura pasa por Server Action con el cliente RLS (nunca service_role).
// RLS (0010) es la primera línea: admin FOR ALL vía is_admin(); coordinator
// FOR ALL solo en sus colegios. Aquí solo validamos forma y normalizamos.
// Sin PII en los mensajes de error (AGENTS §3.1).

export type FormState = { ok: boolean; message: string } | null;

const NEWS_KINDS: NewsKind[] = ["announcement", "result", "photo", "promo", "payment_reminder"];
const EVENT_TYPES: EventType[] = ["match", "tournament", "practice", "festival", "meeting", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (fd: FormData, k: string, max = 2000): string => String(fd.get(k) ?? "").trim().slice(0, max);
const opt = (fd: FormData, k: string, max = 2000): string | null => str(fd, k, max) || null;

/** "2026-10-03T18:50" (hora Panamá, UTC-5 fijo) → ISO timestamptz. */
function panamaLocalToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
}

function revalidateFeeds() {
  revalidatePath("/admin/news");
  revalidatePath("/admin/events");
  revalidatePath("/news");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function createNews(_prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "No autenticado" };

  const school_id = str(fd, "school_id");
  const kind = str(fd, "kind") as NewsKind;
  const title = str(fd, "title", 140);
  const body = opt(fd, "body", 4000);
  const link_url = opt(fd, "link_url", 500);
  const link_label = opt(fd, "link_label", 60);
  const image_url = opt(fd, "image_url", 500);
  const is_published = fd.get("is_published") !== "off";

  if (!UUID.test(school_id)) return { ok: false, message: "Elige un colegio" };
  if (!NEWS_KINDS.includes(kind)) return { ok: false, message: "Tipo de noticia inválido" };
  if (title.length < 3) return { ok: false, message: "El título necesita al menos 3 caracteres" };
  if (link_url && !isHttpUrl(link_url)) return { ok: false, message: "El enlace debe empezar con https://" };
  if (image_url && !(image_url.startsWith("/") || isHttpUrl(image_url)))
    return { ok: false, message: "La imagen debe ser una URL https:// o una ruta /images/…" };

  const { error } = await supabase.from("news_items").insert({
    school_id,
    kind,
    title,
    body,
    link_url,
    link_label: link_url ? link_label ?? "Ver más" : null,
    image_url,
    is_published,
    published_at: new Date().toISOString(),
    created_by: user.id,
    original_lang: "es",
    display_lang: "es",
  });
  if (error) return { ok: false, message: "No se pudo guardar la noticia" };

  revalidateFeeds();
  return { ok: true, message: is_published ? "Noticia publicada. Los padres ya la ven en Noticias." : "Noticia guardada como borrador." };
}

export async function createEvent(_prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "No autenticado" };

  const school_id = str(fd, "school_id");
  const event_type = str(fd, "event_type") as EventType;
  const title = str(fd, "title", 140);
  const description = opt(fd, "description", 4000);
  const location = opt(fd, "location", 200);
  const starts_at = panamaLocalToIso(str(fd, "starts_at"));
  const endsRaw = str(fd, "ends_at");
  const ends_at = endsRaw ? panamaLocalToIso(endsRaw) : null;
  const is_published = fd.get("is_published") !== "off";

  if (!UUID.test(school_id)) return { ok: false, message: "Elige un colegio" };
  if (!EVENT_TYPES.includes(event_type)) return { ok: false, message: "Tipo de evento inválido" };
  if (title.length < 3) return { ok: false, message: "El título necesita al menos 3 caracteres" };
  if (!starts_at) return { ok: false, message: "Indica fecha y hora de inicio" };
  if (endsRaw && !ends_at) return { ok: false, message: "Hora de fin inválida" };
  if (ends_at && ends_at < starts_at) return { ok: false, message: "El fin no puede ser antes del inicio" };

  const { error } = await supabase.from("events").insert({
    school_id,
    event_type,
    title,
    description,
    location,
    starts_at,
    ends_at,
    is_published,
    created_by: user.id,
    original_lang: "es",
    display_lang: "es",
  });
  if (error) return { ok: false, message: "No se pudo guardar el evento" };

  revalidateFeeds();
  return { ok: true, message: is_published ? "Evento publicado. Ya aparece en el calendario de los padres." : "Evento guardado como borrador." };
}

export async function setPublished(table: "news_items" | "events", id: string, value: boolean): Promise<void> {
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from(table).update({ is_published: value }).eq("id", id);
  revalidateFeeds();
}

export async function deleteItem(table: "news_items" | "events", id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from(table).delete().eq("id", id);
  revalidateFeeds();
}
