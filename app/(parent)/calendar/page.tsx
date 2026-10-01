import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPanamaTime, panamaTodayRange } from "@/lib/dates";
import type { EventType } from "@/lib/types";

// Calendario (Sprint 4 T3) — eje "mi colegio" + eje "mi hijo" en una vista.
//   · Banner "Hoy": prácticas y eventos de hoy (Panamá).
//   · Próximos 30 días: eventos del colegio (todos los publicados, RLS 0010) +
//     prácticas (class_sessions) de las actividades de sus hijos, por día.
//   · Horario semanal: lun-vie derivado de activities.days_of_week/start_time.
// Server Component, 3 queries. Sin estado de cliente.

const TZ = "America/Panama";
const DAYS_AHEAD = 30;

type Activity = {
  id: string; name: string;
  days_of_week: string[] | null; start_time: string | null; end_time: string | null;
};
type Student = { id: string; full_name: string; school_id: string; enrollments: { activities: Activity[] }[] };
type EventRow = {
  id: string; school_id: string; title: string; description: string | null; event_type: EventType;
  starts_at: string; ends_at: string | null; location: string | null;
};
type SessionRow = { id: string; activity_id: string; scheduled_start_at: string; scheduled_end_at: string };
type SchoolRow = { id: string; name: string };

type Item = {
  key: string;
  when: Date;
  end: Date | null;
  title: string;
  subtitle: string | null;
  location: string | null;
  kind: EventType | "practice_session";
};

const TYPE_STYLE: Record<Item["kind"], { label: string; color: string }> = {
  match:            { label: "Partido",   color: "#E31E24" },
  tournament:       { label: "Torneo",    color: "#1E3A8A" },
  festival:         { label: "Festival",  color: "#CA8A04" },
  meeting:          { label: "Reunión",   color: "#16A34A" },
  practice:         { label: "Práctica",  color: "#6B7280" },
  other:            { label: "Evento",    color: "#6B7280" },
  practice_session: { label: "Práctica",  color: "#9CA3AF" },
};

const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes"] as const;
const WEEKDAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue", viernes: "Vie",
};

function normalizeDay(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function panamaDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function dayHeading(d: Date): string {
  return new Intl.DateTimeFormat("es-PA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

function shortTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: studentsData, error } = await supabase
    .from("students")
    .select(`
      id, full_name, school_id,
      enrollments!inner ( activities ( id, name, days_of_week, start_time, end_time ) )
    `)
    .eq("is_active", true)
    .eq("enrollments.status", "active")
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  const students = (studentsData ?? []) as Student[];

  const today = panamaTodayRange();
  const horizon = new Date(today.start.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

  const activityById = new Map<string, Activity>();
  const kidsByActivity = new Map<string, string[]>();
  for (const s of students) {
    for (const e of s.enrollments) {
      for (const a of e.activities) {
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
      .select("id, school_id, title, description, event_type, starts_at, ends_at, location")
      .gte("starts_at", today.start.toISOString())
      .lt("starts_at", horizon.toISOString())
      .order("starts_at", { ascending: true }),
    activityIds.length
      ? supabase
          .from("class_sessions")
          .select("id, activity_id, scheduled_start_at, scheduled_end_at")
          .in("activity_id", activityIds)
          .gte("scheduled_start_at", today.start.toISOString())
          .lt("scheduled_start_at", horizon.toISOString())
          .order("scheduled_start_at", { ascending: true })
      : Promise.resolve({ data: [] as SessionRow[] }),
    schoolIds.length > 1
      ? supabase.from("schools").select("id, name").in("id", schoolIds)
      : Promise.resolve({ data: [] as SchoolRow[] }),
  ]);

  const events = (eventsResult.data ?? []) as EventRow[];
  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const schoolName = new Map(((schoolsResult.data ?? []) as SchoolRow[]).map((s) => [s.id, s.name]));

  const items: Item[] = [
    ...events.map((e) => ({
      key: `e-${e.id}`,
      when: new Date(e.starts_at),
      end: e.ends_at ? new Date(e.ends_at) : null,
      title: e.title,
      subtitle: schoolName.get(e.school_id) ?? null,
      location: e.location,
      kind: e.event_type,
    })),
    ...sessions.map((s) => {
      const a = activityById.get(s.activity_id);
      const kids = kidsByActivity.get(s.activity_id) ?? [];
      return {
        key: `s-${s.id}`,
        when: new Date(s.scheduled_start_at),
        end: new Date(s.scheduled_end_at),
        title: a?.name ?? "Práctica",
        subtitle: kids.length ? kids.join(" y ") : null,
        location: null,
        kind: "practice_session" as const,
      };
    }),
  ].sort((a, b) => a.when.getTime() - b.when.getTime());

  const todayKey = panamaDayKey(today.start);
  const todayItems = items.filter((i) => panamaDayKey(i.when) === todayKey);

  const byDay = new Map<string, { date: Date; items: Item[] }>();
  for (const it of items) {
    const k = panamaDayKey(it.when);
    const entry = byDay.get(k) ?? { date: it.when, items: [] };
    entry.items.push(it);
    byDay.set(k, entry);
  }

  // Horario semanal: por día de la semana, actividades con sus hijos.
  const weekly = WEEKDAYS.map((d) => ({
    day: d,
    slots: Array.from(activityById.values())
      .filter((a) => (a.days_of_week ?? []).map(normalizeDay).includes(d))
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
      .map((a) => ({ activity: a, kids: kidsByActivity.get(a.id) ?? [] })),
  }));

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
        Calendario
      </h1>

      {/* HOY */}
      <section
        className="rounded-2xl p-4 text-white"
        style={{ backgroundColor: todayItems.length ? "var(--portesco-blue)" : "#6B7280" }}
      >
        <p className="text-[11px] uppercase tracking-wide opacity-80">Hoy · {dayHeading(today.start)}</p>
        {todayItems.length === 0 ? (
          <p className="text-base font-semibold mt-1">Hoy no hay prácticas ni eventos</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {todayItems.map((it) => (
              <li key={it.key} className="text-base font-semibold leading-snug">
                {it.kind === "practice_session"
                  ? `Práctica de ${it.title} a las ${formatPanamaTime(it.when)}${it.subtitle ? ` · ${it.subtitle}` : ""}`
                  : `${TYPE_STYLE[it.kind].label}: ${it.title} a las ${formatPanamaTime(it.when)}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* PRÓXIMOS 30 DÍAS */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--portesco-gray-mid)" }}>
          Próximos 30 días
        </h2>
        {byDay.size === 0 ? (
          <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
            No hay eventos ni prácticas programadas.
          </p>
        ) : (
          Array.from(byDay.values()).map(({ date, items: dayItems }) => (
            <div key={panamaDayKey(date)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <p className="px-4 pt-3 pb-1 text-sm font-semibold capitalize text-gray-900">
                {dayHeading(date)}
              </p>
              <ul className="divide-y divide-gray-100">
                {dayItems.map((it) => {
                  const style = TYPE_STYLE[it.kind];
                  return (
                    <li key={it.key} className="flex items-stretch gap-3 px-4 py-2.5">
                      <span aria-hidden className="w-1 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                      <div className="flex flex-col min-w-0">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{it.title}</p>
                        <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
                          {style.label} · {formatPanamaTime(it.when)}
                          {it.end ? `–${formatPanamaTime(it.end)}` : ""}
                          {it.subtitle ? ` · ${it.subtitle}` : ""}
                          {it.location ? ` · ${it.location}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* HORARIO SEMANAL */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--portesco-gray-mid)" }}>
          Horario semanal
        </h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {weekly.map(({ day, slots }) => (
            <div key={day} className="flex gap-3 px-4 py-2.5">
              <span className="w-8 shrink-0 text-sm font-semibold" style={{ color: "var(--portesco-blue)" }}>
                {WEEKDAY_LABEL[day]}
              </span>
              {slots.length === 0 ? (
                <span className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>—</span>
              ) : (
                <ul className="flex flex-col gap-1 min-w-0">
                  {slots.map(({ activity, kids }) => (
                    <li key={activity.id} className="text-sm text-gray-900 leading-snug">
                      <span className="font-medium">{shortTime(activity.start_time)}</span>
                      {activity.end_time ? `–${shortTime(activity.end_time)}` : ""} · {activity.name}
                      {kids.length ? (
                        <span style={{ color: "var(--portesco-gray-mid)" }}> · {kids.join(", ")}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
