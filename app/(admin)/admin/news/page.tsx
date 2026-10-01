import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NEWS_KIND_LABEL } from "@/lib/constants";
import type { NewsKind } from "@/lib/types";
import { RowActions } from "@/components/admin/form-bits";
import { NewsForm } from "./news-form";

// Noticias (admin) — Sprint 4 T9. Formulario de publicación + últimas 30.
// Lo que se publica aquí lo ve el padre en /news al instante (RLS 0010).

type NewsRow = {
  id: string; school_id: string; kind: NewsKind; title: string; is_published: boolean;
  published_at: string; schools: { name: string } | { name: string }[] | null;
};

const fmt = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const schoolName = (s: NewsRow["schools"]) => (Array.isArray(s) ? s[0]?.name : s?.name) ?? "";

export default async function AdminNewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [schoolsR, newsR] = await Promise.all([
    supabase.from("schools").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("news_items")
      .select("id, school_id, kind, title, is_published, published_at, schools ( name )")
      .order("published_at", { ascending: false })
      .limit(30),
  ]);
  const schools = schoolsR.data ?? [];
  const news = (newsR.data ?? []) as NewsRow[];

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>Noticias</h1>
        <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
          Anuncios, resultados y fotos que ven los padres en su pestaña Noticias.
        </p>
      </div>

      <NewsForm schools={schools} />

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">Últimas publicadas</h2>
        {news.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--portesco-gray-mid)" }}>Todavía no hay noticias.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {news.map((n) => (
              <li key={n.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                  <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
                    {NEWS_KIND_LABEL[n.kind]} · {schoolName(n.schools)} · {fmt.format(new Date(n.published_at))}
                  </p>
                </div>
                <RowActions table="news_items" id={n.id} published={n.is_published} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
