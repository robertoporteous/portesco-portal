import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { panamaTodayRange } from "@/lib/dates";
import { rel } from "@/lib/parent-attendance";

// Admin overview (Sprint 4 T6, stretch) — primera pantalla real del Manager
// Brain. Solo conteos y porcentajes: ningún nombre de estudiante sale de aquí
// (regla del demo). Admin ve todo vía is_admin() en cada policy.
// 4 tarjetas + tabla por colegio. Server Component, 5 queries, cómputo en JS.

type SchoolRow = { id: string; name: string; is_active: boolean };
type StudentRow = { school_id: string };
type ActivityRow = { school_id: string };
type SessionRow = { id: string; closed_at: string | null; activities: { school_id: string } | { school_id: string }[] | null };
type AttendanceRow = { session_id: string; status: "present" | "absent" | "justified" | "late" | "not_marked" };

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = panamaTodayRange();
  const weekAgo = new Date(today.start.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [schoolsR, studentsR, activitiesR, sessionsR] = await Promise.all([
    supabase.from("schools").select("id, name, is_active").order("name"),
    supabase.from("students").select("school_id").eq("is_active", true),
    supabase.from("activities").select("school_id").eq("is_active", true),
    supabase
      .from("class_sessions")
      .select("id, closed_at, activities ( school_id )")
      .gte("scheduled_start_at", weekAgo.toISOString())
      .lt("scheduled_start_at", today.end.toISOString()),
  ]);
  if (schoolsR.error) throw new Error(schoolsR.error.message);

  const schools = (schoolsR.data ?? []) as SchoolRow[];
  const students = (studentsR.data ?? []) as StudentRow[];
  const activities = (activitiesR.data ?? []) as ActivityRow[];
  const sessions = (sessionsR.data ?? []) as SessionRow[];

  const sessionIds = sessions.map((s) => s.id);
  const attendanceR = sessionIds.length
    ? await supabase.from("class_attendance").select("session_id, status").in("session_id", sessionIds)
    : { data: [] as AttendanceRow[] };
  const attendance = (attendanceR.data ?? []) as AttendanceRow[];

  // ── Agregados ──
  const schoolOfSession = new Map(sessions.map((s) => [s.id, rel(s.activities)[0]?.school_id ?? null]));

  const count = <T,>(rows: T[], pick: (r: T) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const studentsBySchool = count(students, (r) => r.school_id);
  const activitiesBySchool = count(activities, (r) => r.school_id);

  // Asistencia 7d: marcados (status != not_marked) como denominador, present+late como numerador.
  const attBySchool = new Map<string, { marked: number; attended: number }>();
  let markedAll = 0;
  let attendedAll = 0;
  for (const a of attendance) {
    if (a.status === "not_marked") continue;
    const sch = schoolOfSession.get(a.session_id);
    if (!sch) continue;
    const e = attBySchool.get(sch) ?? { marked: 0, attended: 0 };
    e.marked += 1;
    markedAll += 1;
    if (a.status === "present" || a.status === "late") {
      e.attended += 1;
      attendedAll += 1;
    }
    attBySchool.set(sch, e);
  }

  const closedToday = sessions.filter((s) => {
    if (!s.closed_at) return false;
    const t = new Date(s.closed_at);
    return t >= today.start && t < today.end;
  }).length;

  const activeSchools = schools.filter((s) => s.is_active);
  const pct = (attended: number, marked: number) => (marked === 0 ? null : Math.round((100 * attended) / marked));
  const pctAll = pct(attendedAll, markedAll);

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
          Panel de Administración
        </h1>
        <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
          Resumen operativo · últimos 7 días
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Colegios activos" value={String(activeSchools.length)} />
        <Stat label="Estudiantes activos" value={String(students.length)} />
        <Stat label="Asistencia 7 días" value={pctAll === null ? "—" : `${pctAll}%`} hint={markedAll ? `${markedAll} marcas` : "sin clases marcadas"} />
        <Stat label="Clases cerradas hoy" value={String(closedToday)} />
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--portesco-gray-mid)" }}>
              <th className="px-4 py-3 font-medium">Colegio</th>
              <th className="px-4 py-3 font-medium text-right">Estudiantes</th>
              <th className="px-4 py-3 font-medium text-right">Actividades</th>
              <th className="px-4 py-3 font-medium text-right">Asistencia 7d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeSchools.map((s) => {
              const a = attBySchool.get(s.id);
              const p = a ? pct(a.attended, a.marked) : null;
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{studentsBySchool.get(s.id) ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{activitiesBySchool.get(s.id) ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p === null ? <span style={{ color: "var(--portesco-gray-mid)" }}>—</span> : `${p}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
        Asistencia = presentes y tardes sobre el total de marcas (presente, ausente, justificado, tarde) en clases de los últimos 7 días.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col">
      <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--portesco-gray-mid)" }}>
        {label}
      </span>
      <span className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</span>
      {hint && <span className="text-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>{hint}</span>}
    </div>
  );
}
