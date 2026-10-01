import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { NewsKind } from "@/lib/types";

// Noticias (Sprint 4 T4) — eje "mi colegio": el feed del colegio de sus hijos.
// RLS (0010) ya limita a los news_items publicados de las escuelas de sus hijos.
// Si un padre tiene hijos en 2 colegios, aparecen tabs (?school=<id>). Server
// Component, sin estado de cliente. body es plain text (AGENTS §4): se renderiza
// respetando saltos de línea, nunca como HTML/markdown.

type NewsRow = {
  id: string; school_id: string; kind: NewsKind; title: string; body: string | null;
  image_url: string | null; link_url: string | null; link_label: string | null;
  published_at: string;
  activities: { name: string } | { name: string }[] | null;
};
type SchoolRow = { id: string; name: string };

const KIND_STYLE: Record<NewsKind, { label: string; color: string }> = {
  result:           { label: "Resultado",  color: "#E31E24" },
  announcement:     { label: "Anuncio",    color: "#1E3A8A" },
  photo:            { label: "Foto",       color: "#9333EA" },
  promo:            { label: "Promoción",  color: "#CA8A04" },
  payment_reminder: { label: "Pago",       color: "#EA580C" },
};

function relativeTime(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.round(d / 30);
  return m === 1 ? "hace 1 mes" : `hace ${m} meses`;
}

function activityName(a: NewsRow["activities"]): string | null {
  if (!a) return null;
  return Array.isArray(a) ? a[0]?.name ?? null : a.name;
}

/** "Fútbol Secundaria 3 – 1 Colegio X" → marcador grande si el título lo trae. */
function parseScore(title: string): { home: string; hs: string; as: string; away: string } | null {
  const m = title.match(/^(.+?)\s+(\d+)\s*[–-]\s*(\d+)\s+(.+)$/);
  return m ? { home: m[1], hs: m[2], as: m[3], away: m[4] } : null;
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { school: requestedSchool } = await searchParams;

  const [schoolsResult, newsResult] = await Promise.all([
    supabase.from("schools").select("id, name").order("name"),
    supabase
      .from("news_items")
      .select("id, school_id, kind, title, body, image_url, link_url, link_label, published_at, activities ( name )")
      .order("published_at", { ascending: false })
      .limit(50),
  ]);
  if (newsResult.error) throw new Error(newsResult.error.message);

  const allNews = (newsResult.data ?? []) as NewsRow[];
  // Solo colegios con noticias visibles (schools RLS incluye colegios de staff;
  // para un padre son los de sus hijos).
  const schoolIdsWithNews = new Set(allNews.map((n) => n.school_id));
  const schools = ((schoolsResult.data ?? []) as SchoolRow[]).filter((s) => schoolIdsWithNews.has(s.id));
  const selectedSchool =
    schools.length > 1 ? schools.find((s) => s.id === requestedSchool) ?? schools[0] : null;
  const news = selectedSchool ? allNews.filter((n) => n.school_id === selectedSchool.id) : allNews;

  const now = new Date();

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
        Noticias
      </h1>

      {schools.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          {schools.map((s) => {
            const active = s.id === selectedSchool?.id;
            return (
              <Link
                key={s.id}
                href={`/news?school=${s.id}`}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border ${
                  active ? "text-white border-transparent" : "bg-white text-gray-700 border-gray-200"
                }`}
                style={active ? { backgroundColor: "var(--portesco-blue)" } : undefined}
              >
                {s.name}
              </Link>
            );
          })}
        </div>
      )}

      {news.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
            Todavía no hay noticias de tu colegio.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {news.map((n) => (
            <NewsCard key={n.id} item={n} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewsCard({ item, now }: { item: NewsRow; now: Date }) {
  const style = KIND_STYLE[item.kind];
  const score = item.kind === "result" ? parseScore(item.title) : null;
  const act = activityName(item.activities);

  return (
    <li className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {item.kind === "photo" && item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="w-full aspect-[16/9] object-cover" />
      )}
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-white"
            style={{ backgroundColor: style.color }}
          >
            {style.label}
          </span>
          <span className="text-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>
            {relativeTime(item.published_at, now)}
          </span>
        </div>

        {score ? (
          <div className="flex items-center justify-between gap-3 py-1">
            <p className="text-sm font-medium text-gray-900 flex-1 text-right leading-tight">{score.home}</p>
            <p className="text-2xl font-bold tabular-nums shrink-0" style={{ color: "var(--portesco-blue)" }}>
              {score.hs} – {score.as}
            </p>
            <p className="text-sm font-medium text-gray-900 flex-1 leading-tight">{score.away}</p>
          </div>
        ) : (
          <p className="text-base font-semibold text-gray-900 leading-snug">{item.title}</p>
        )}

        {item.body && (
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{item.body}</p>
        )}

        {act && (
          <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>{act}</p>
        )}

        {item.kind === "payment_reminder" && (
          <Link
            href="/profile#pago"
            className="self-start text-sm font-medium rounded-full px-3 py-1.5 text-white"
            style={{ backgroundColor: "var(--portesco-red)" }}
          >
            Ver cómo pagar →
          </Link>
        )}

        {item.link_url && (
          <a
            href={item.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-sm font-medium rounded-full px-3 py-1.5 border"
            style={{ color: "var(--portesco-blue)", borderColor: "var(--portesco-blue)" }}
          >
            {item.link_label ?? "Abrir enlace"} ↗
          </a>
        )}
      </div>
    </li>
  );
}
