import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPanamaTime, panamaTodayRange } from "@/lib/dates";
import { rel } from "@/lib/parent-attendance";
import type { EventType } from "@/lib/types";
import { MonthCalendar, type CalItem } from "@/components/parent/month-calendar";

// Calendario (Sprint 4 T3 → rediseño T7): grilla mensual compacta con los
// eventos en pequeño dentro de cada día; tocar un día lista el detalle. Arriba
// el banner "Hoy" (recordatorio sin push). Abajo el horario semanal.
// Datos: eventos del colegio (RLS 0010) + prácticas (class_sessions) de las
// actividades de sus hijos, desde el 1 del mes actual hasta el fin del mes
// siguiente. Server Component arma los items; la grilla es Client.

const TZ = "America/Panama";

type Activity = { id: string; name: string; days_of_week: string[] | null; start_time: string | null; end_time: string | null };
type Student = { id: string; full_name: string; school_id: string; enrollments: { activities: Activity | Activity[] }[] };
type EventRow = { id: string; school_id: string; title: string; event_type: EventType; starts_at: string; ends_at: string | null; location: string | null };
type SessionRow = { id: string; activity_id: string; scheduled_start_at: string; scheduled_end_at: string };
type SchoolRow = { id: string; name: string };

const TYPE_STYLE: Record<EventType | "practice_session", { label: string; color: string }> = {
  match:            { label: "Partido",   color: "#E31E24" },
  tournament:       { label: "Torneo",    color: "#1E3A8A" },
  festival:         { label: "Festival",  color: "#CA8A04" },
  meeting:          { label: "Reunión",   color: "#16A34A" },
  practice:         { label: "Práctica",  color: "#6B7280" },
  other:            { label: "Evento",    color: "#6B7280" },
  practice_session: { label: "Práctica",  color: "#9CA3AF" },
};

const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes"] as const;
const WEEKDAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = { lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue", viernes: "Vie" };

const normalizeDay = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const panamaDayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function shortTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
/** Etiqueta corta para la celda: "Fútbol Prim." / "Liga FCC S4" */
function shortLabel(title: string, max = 14): string {
  const t = title.replace("Liga FCC Sub 18 · ", "FCC ").replace(" Primaria", " Prim.").replace(" Secundaria", " Sec.");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: studentsData, error } = await supabase
    .from("students")
    .select(`id, full_name, school_id, enrollments!inner ( activities ( id, name, days_of_week, start_time, end_time ) )`)
    .eq("is_active", true)
    .eq("enrollments.status", "active")
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  const students = (studentsData ?? []) as Student[];

  const today = panamaTodayRange();
  const todayKey = panamaDayKey(today.start);
  const [ty, tm] = todayKey.split("-").map(Number);
  // Rango: 1 del mes actual → fin del mes siguiente (Panamá, UTC-5 fijo).
  const rangeStart = new Date(`${ty}-${String(tm).padStart(2, "0")}-01T00:00:00-05:00`);
  const nextY = tm >= 11 ? ty + 1 : ty;
  const endM = ((tm + 1) % 12) + 1; // mes después del siguiente
  const endY = tm >= 11 ? nextY + (tm === 12 ? 0 : 0) : ty;
  const rangeEnd = new Date(`${tm === 11 ? ty + 1 : tm === 12 ? ty + 1 : endY}-${String(endM).padStart(2, "0")}-01T00:00:00-05:00`);
  const maxMonth = `${tm === 12 ? ty + 1 : ty}-${String(tm === 12 ? 1 : tm + 1).padStart(2, "0")}`;
  const minMonth = `${ty}-${String(tm).padStart(2, "0")}`;

  const activityById = new Map<string, Activity>();
  const kidsByActivity = new Map<string, string[]>();
  for (const s of students) {
    for (const e of s.enrollments) {
      for (const a of rel(e.activities)) {
        activityById.set(a.id, a);
        kidsByActivity.set(a.id, [...(kidsByActivity.get(a.id) ?? []), s.full_name.split(" ")[0]]);
      }
    }
  }
  const activityIds = Array.from(activityById.keys());
  const schoolIds = Array.from(new Set(students.map((s) => s.school_id)));

  const [eventsResult, sessionsResult, schoolsResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, school_id, title, event_type, starts_at, ends_at, location")
      .gte("starts_at", rangeStart.toISOString())
      .lt("starts_at", rangeEnd.toISOString())
      .order("starts_at", { ascending: true }),
    activityIds.length
      ? supabase
          .from("class_sessions")
          .select("id, activity_id, scheduled_start_at, scheduled_end_at")
          .in("activity_id", activityIds)
          .gte("scheduled_start_at", rangeStart.toISOString())
          .lt("scheduled_start_at", rangeEnd.toISOString())
          .order("scheduled_start_at", { ascending: true })
      : Promise.resolve({ data: [] as SessionRow[] }),
    schoolIds.length > 1 ? supabase.from("schools").select("id, name").in("id", schoolIds) : Promise.resolve({ data: [] as SchoolRow[] }),
  ]);

  const events = (eventsResult.data ?? []) as EventRow[];
  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const schoolName = new Map(((schoolsResult.data ?? []) as SchoolRow[]).map((s) => [s.id, s.name]));

  const items: CalItem[] = [
    ...events.map((e) => {
      const st = TYPE_STYLE[e.event_type];
      const start = new Date(e.starts_at);
      return {
        key: `e-${e.id}`,
        dayKey: panamaDayKey(start),
        startIso: e.starts_at,
        endIso: e.ends_at,
        time: formatPanamaTime(start),
        endTime: e.ends_at ? formatPanamaTime(new Date(e.ends_at)) : null,
        title: e.title,
        short: shortLabel(e.title),
        subtitle: schoolName.get(e.school_id) ?? null,
        location: e.location,
        kindLabel: st.label,
        color: st.color,
      };
    }),
    ...sessions.map((s) => {
      const a = activityById.get(s.activity_id);
      const kids = kidsByActivity.get(s.activity_id) ?? [];
      const st = TYPE_STYLE.practice_session;
      const start = new Date(s.scheduled_start_at);
      return {
        key: `s-${s.id}`,
        dayKey: panamaDayKey(start),
        startIso: s.scheduled_start_at,
        endIso: s.scheduled_end_at,
        time: formatPanamaTime(start),
        endTime: formatPanamaTime(new Date(s.scheduled_end_at)),
        title: a?.name ?? "Práctica",
        short: shortLabel(a?.name ?? "Práctica"),
        subtitle: kids.length ? kids.join(" y ") : null,
        location: null,
        kindLabel: st.label,
        color: st.color,
      };
    }),
  ].sort((a, b) => a.startIso.localeCompare(b.startIso));

  const todayItems = items.filter((i) => i.dayKey === todayKey);

  const weekly = WEEKDAYS.map((d) => ({
    day: d,
    slots: Array.from(activityById.values())
      .filter((a) => (a.days_of_week ?? []).map(normalizeDay).includes(d))
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
      .map((a) => ({ activity: a, kids: kidsByActivity.get(a.id) ?? [] })),
  }));

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
        Calendario
      </h1>

      {/* HOY */}
      <section className="rounded-2xl px-4 py-3 text-white" style={{ backgroundColor: todayItems.length ? "var(--portesco-blue)" : "#6B7280" }}>
        <p className="text-[11px] uppercase tracking-wide opacity-80">Hoy</p>
        {todayItems.length === 0 ? (
          <p className="text-sm font-semibold">No hay prácticas ni eventos</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {todayItems.map((it) => (
              <li key={it.key} className="text-sm font-semibold leading-snug">
                {it.kindLabel} de {it.title} · {it.time}
                {it.subtitle ? ` · ${it.subtitle}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <MonthCalendar items={items} todayKey={todayKey} minMonth={minMonth} maxMonth={maxMonth} />

      {/* HORARIO SEMANAL — compacto */}
      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <summary className="px-4 py-3 text-sm font-semibold cursor-pointer" style={{ color: "var(--portesco-blue)" }}>
          Horario semanal de prácticas
        </summary>
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {weekly.map(({ day, slots }) => (
            <div key={day} className="flex gap-3 px-4 py-2">
              <span className="w-8 shrink-0 text-sm font-semibold" style={{ color: "var(--portesco-blue)" }}>
                {WEEKDAY_LABEL[day]}
              </span>
              {slots.length === 0 ? (
                <span className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>—</span>
              ) : (
                <ul className="flex flex-col gap-0.5 min-w-0">
                  {slots.map(({ activity, kids }) => (
                    <li key={activity.id} className="text-sm text-gray-900 leading-snug">
                      <span className="font-medium">{shortTime(activity.start_time)}</span>
                      {activity.end_time ? `–${shortTime(activity.end_time)}` : ""} · {activity.name}
                      {kids.length ? <span style={{ color: "var(--portesco-gray-mid)" }}> · {kids.join(", ")}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
