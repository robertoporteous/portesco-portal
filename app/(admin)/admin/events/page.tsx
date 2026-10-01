import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPE_LABEL } from "@/lib/constants";
import type { EventType } from "@/lib/types";
import { RowActions } from "@/components/admin/form-bits";
import { EventForm } from "./event-form";

// Eventos (admin) — Sprint 4 T9. Formulario + próximos 40 eventos desde hoy.
// Lo publicado aquí cae en el calendario del padre (RLS 0010).

type EventRow = {
  id: string; school_id: string; event_type: EventType; title: string; starts_at: string;
  location: string | null; is_published: boolean; schools: { name: string } | { name: string }[] | null;
};

const fmt = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const schoolName = (s: EventRow["schools"]) => (Array.isArray(s) ? s[0]?.name : s?.name) ?? "";

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 1);

  const [schoolsR, eventsR] = await Promise.all([
    supabase.from("schools").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("events")
      .select("id, school_id, event_type, title, starts_at, location, is_published, schools ( name )")
      .gte("starts_at", since.toISOString())
      .order("starts_at", { ascending: true })
      .limit(40),
  ]);
  const schools = schoolsR.data ?? [];
  const events = (eventsR.data ?? []) as EventRow[];

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>Eventos</h1>
        <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
          Partidos, torneos, festivales y reuniones. Aparecen en el calendario de los padres.
        </p>
      </div>

      <EventForm schools={schools} />

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">Próximos eventos</h2>
        {events.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--portesco-gray-mid)" }}>No hay eventos próximos.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
                  <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
                    {EVENT_TYPE_LABEL[e.event_type]} · {fmt.format(new Date(e.starts_at))} · {schoolName(e.schools)}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                </div>
                <RowActions table="events" id={e.id} published={e.is_published} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
