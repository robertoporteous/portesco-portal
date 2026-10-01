import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPanamaDate, formatPanamaTime } from "@/lib/dates";
import {
  rel,
  ATTENDED,
  STATUS_DISPLAY,
  panamaMonthName,
  panamaMonthRange,
  type AttendanceRow,
  type SessionRow,
} from "@/lib/parent-attendance";
import type { AttendanceStatus } from "@/lib/types";

// Avance (Sprint 4 T2) — eje "mi hijo".
// Server Component. El hijo seleccionado viaja en ?student=<id>; sin estado de
// cliente. Muestra, por actividad, la barra de asistencia del mes y las últimas
// 10 clases con su estado. El reporte quincenal del profesor NO existe todavía
// (Bloque 4): el bloque de abajo lo dice tal cual, sin inventar datos.

type Activity = { id: string; name: string; schedule: string | null };
type Enrollment = { id: string; activities: Activity | Activity[] };
type Student = { id: string; full_name: string; grade: string; enrollments: Enrollment[] };

const LAST_N = 10;

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { student: requested } = await searchParams;

  const { data: studentsData, error } = await supabase
    .from("students")
    .select(
      `
      id, full_name, grade,
      enrollments!inner ( id, activities ( id, name, schedule ) )
    `
    )
    .eq("is_active", true)
    .eq("enrollments.status", "active")
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);

  const students = (studentsData ?? []) as Student[];
  const selected =
    students.find((s) => s.id === requested) ?? students[0] ?? null;

  if (!selected) {
    return (
      <Shell title="Avance">
        <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
          Aún no tienes estudiantes registrados. Contacta a tu coordinadora.
        </p>
      </Shell>
    );
  }

  const activities = selected.enrollments
    .flatMap((e) => rel(e.activities))
    .sort((a, b) => a.name.localeCompare(b.name));
  const activityIds = activities.map((a) => a.id);

  const now = new Date();
  const month = panamaMonthRange(now);

  // Últimas N clases ya ocurridas por actividad (pedimos N × actividades y
  // recortamos en JS) + asistencia del hijo en esas sesiones.
  const { data: sessionsData } = await supabase
    .from("class_sessions")
    .select("id, activity_id, scheduled_start_at, closed_at")
    .in("activity_id", activityIds)
    .lt("scheduled_start_at", now.toISOString())
    .order("scheduled_start_at", { ascending: false })
    .limit(LAST_N * Math.max(activityIds.length, 1) * 2);
  const sessions = (sessionsData ?? []) as SessionRow[];

  const { data: attendanceData } = await supabase
    .from("class_attendance")
    .select("session_id, student_id, status")
    .eq("student_id", selected.id)
    .in("session_id", sessions.map((s) => s.id));
  const attendance = (attendanceData ?? []) as AttendanceRow[];
  const statusBySession = new Map(attendance.map((a) => [a.session_id, a.status]));

  const monthName = panamaMonthName(now);

  return (
    <Shell title="Avance">
      {students.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          {students.map((s) => {
            const active = s.id === selected.id;
            return (
              <Link
                key={s.id}
                href={`/progress?student=${s.id}`}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border ${
                  active
                    ? "text-white border-transparent"
                    : "bg-white text-gray-700 border-gray-200"
                }`}
                style={active ? { backgroundColor: "var(--portesco-blue)" } : undefined}
              >
                {s.full_name.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
        {selected.full_name} · {selected.grade}
      </p>

      {activities.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
          Sin actividades activas.
        </p>
      ) : (
        activities.map((activity) => {
          const own = sessions.filter((s) => s.activity_id === activity.id);
          const inMonthClosed = own.filter(
            (s) =>
              s.closed_at !== null &&
              new Date(s.scheduled_start_at) >= month.start &&
              new Date(s.scheduled_start_at) < month.end
          );
          const attendedInMonth = inMonthClosed.filter((s) => {
            const st = statusBySession.get(s.id);
            return st !== undefined && ATTENDED.has(st);
          }).length;
          const last = own.slice(0, LAST_N);
          return (
            <ActivityCard
              key={activity.id}
              activity={activity}
              monthName={monthName}
              attended={attendedInMonth}
              closed={inMonthClosed.length}
              rows={last.map((s) => ({
                id: s.id,
                when: new Date(s.scheduled_start_at),
                closed: s.closed_at !== null,
                status: statusBySession.get(s.id) ?? null,
              }))}
            />
          );
        })
      )}

      <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-4">
        <p className="text-sm font-semibold" style={{ color: "var(--portesco-blue)" }}>
          Reporte quincenal del profesor
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--portesco-gray-mid)" }}>
          Aquí vas a recibir, cada dos semanas, un resumen escrito por el profesor
          sobre cómo va {selected.full_name.split(" ")[0]} en cada actividad.
        </p>
      </section>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
        {title}
      </h1>
      {children}
    </div>
  );
}

function ActivityCard({
  activity,
  monthName,
  attended,
  closed,
  rows,
}: {
  activity: Activity;
  monthName: string;
  attended: number;
  closed: number;
  rows: { id: string; when: Date; closed: boolean; status: AttendanceStatus | null }[];
}) {
  const pct = closed === 0 ? 0 : Math.round((attended / closed) * 100);
  const barColor = closed === 0 ? "#D1D5DB" : pct >= 80 ? "#10B981" : pct >= 60 ? "#F59E0B" : "#EF4444";

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-semibold text-gray-900">{activity.name}</p>
          <p className="text-sm font-medium text-gray-700 shrink-0">
            {closed === 0 ? "—" : `${attended} de ${closed}`}
          </p>
        </div>
        {activity.schedule && (
          <p className="text-xs -mt-1" style={{ color: "var(--portesco-gray-mid)" }}>
            {activity.schedule}
          </p>
        )}
        <div
          className="h-2 w-full rounded-full bg-gray-100 overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Asistencia de ${monthName}`}
        >
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        </div>
        <p className="text-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>
          {closed === 0
            ? `Sin clases cerradas en ${monthName} todavía`
            : `Asistencia de ${monthName} · ${pct}%`}
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="border-t border-gray-100 divide-y divide-gray-100">
          {rows.map((r) => {
            const key: AttendanceStatus | "missing" =
              r.status ?? (r.closed ? "missing" : "not_marked");
            const d = r.closed || r.status ? STATUS_DISPLAY[key] : { label: "Pendiente", className: "bg-gray-50 text-gray-500" };
            return (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-900 capitalize">{formatPanamaDate(r.when)}</span>
                  <span className="text-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>
                    {formatPanamaTime(r.when)}
                  </span>
                </div>
                <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${d.className}`}>
                  {d.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
