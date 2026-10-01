import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPanamaNextSession } from "@/lib/dates";
import {
  monthSummaryFor,
  nextSessionFor,
  panamaMonthName,
  panamaMonthRange,
  type AttendanceRow,
  type MonthSummary,
  type SessionRow,
} from "@/lib/parent-attendance";

type Activity = {
  id: string;
  name: string;
  category: "deporte" | "arte" | "academico" | "cuidado";
  schedule: string | null;
  start_time: string | null;
};

type Enrollment = {
  id: string;
  // Supabase types FK joins as arrays even when the FK is single-valued.
  activities: Activity[];
};

type Student = {
  id: string;
  full_name: string;
  grade: string;
  avatar_url: string | null;
  enrollments: Enrollment[];
};

const CATEGORY_COLOR: Record<Activity["category"], string> = {
  deporte: "#16A34A",   // green
  arte: "#9333EA",      // purple
  academico: "#1E3A8A", // portesco blue
  cuidado: "#EA580C",   // orange
};

export default async function ParentHomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileResult, studentsResult] = await Promise.all([
    supabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("students")
      .select(
        `
        id,
        full_name,
        grade,
        avatar_url,
        enrollments!inner (
          id,
          activities (
            id,
            name,
            category,
            schedule,
            start_time
          )
        )
      `
      )
      .eq("is_active", true)
      .eq("enrollments.status", "active")
      .order("full_name", { ascending: true }),
  ]);

  if (studentsResult.error) {
    throw new Error(studentsResult.error.message);
  }

  const firstName = profileResult.data?.full_name?.split(" ")[0] ?? null;
  const students = (studentsResult.data ?? []) as Student[];

  // ── Sprint 4 T2: asistencia del mes + próxima práctica ──
  // One query for sessions (this month → +60 days) across every activity of
  // every kid, one for this month's attendance rows. RLS (0010) already scopes
  // both to this parent; the activity_id filter only keeps the payload small.
  const activityIds = Array.from(
    new Set(students.flatMap((s) => s.enrollments.flatMap((e) => e.activities.map((a) => a.id))))
  );
  const now = new Date();
  const month = panamaMonthRange(now);
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  let sessions: SessionRow[] = [];
  let attendance: AttendanceRow[] = [];
  if (activityIds.length > 0) {
    const [sessionsResult, attendanceResult] = await Promise.all([
      supabase
        .from("class_sessions")
        .select("id, activity_id, scheduled_start_at, closed_at")
        .in("activity_id", activityIds)
        .gte("scheduled_start_at", month.start.toISOString())
        .lt("scheduled_start_at", horizon.toISOString())
        .order("scheduled_start_at", { ascending: true }),
      supabase
        .from("class_attendance")
        .select("session_id, student_id, status, class_sessions!inner ( scheduled_start_at )")
        .in("student_id", students.map((s) => s.id))
        .gte("class_sessions.scheduled_start_at", month.start.toISOString())
        .lt("class_sessions.scheduled_start_at", month.end.toISOString()),
    ]);
    sessions = (sessionsResult.data ?? []) as SessionRow[];
    attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  }

  const monthName = panamaMonthName(now);

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <h1
        className="text-2xl font-semibold"
        style={{ color: "var(--portesco-blue)" }}
      >
        {firstName ? `Hola, ${firstName}` : "Hola"}
      </h1>

      {students.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {students.map((student) => {
            const ids = new Set(student.enrollments.flatMap((e) => e.activities.map((a) => a.id)));
            const sessionsInMonth = sessions.filter(
              (s) => new Date(s.scheduled_start_at) < month.end
            );
            const summary = monthSummaryFor(ids, student.id, sessionsInMonth, attendance);
            const next = nextSessionFor(ids, sessions, now);
            const nextActivity = next
              ? student.enrollments.flatMap((e) => e.activities).find((a) => a.id === next.activity_id)
              : null;
            return (
              <StudentCard
                key={student.id}
                student={student}
                summary={summary}
                monthName={monthName}
                nextLabel={
                  next && nextActivity
                    ? `${formatPanamaNextSession(new Date(next.scheduled_start_at))} · ${nextActivity.name}`
                    : null
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function StudentCard({
  student,
  summary,
  monthName,
  nextLabel,
}: {
  student: Student;
  summary: MonthSummary;
  monthName: string;
  nextLabel: string | null;
}) {
  const activities = student.enrollments
    .flatMap((e) => e.activities)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <Avatar name={student.full_name} url={student.avatar_url} />
        <div className="flex flex-col">
          <p
            className="text-base font-semibold"
            style={{ color: "var(--portesco-blue)" }}
          >
            {student.full_name}
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--portesco-gray-mid)" }}
          >
            {student.grade}
          </p>
        </div>
      </div>

      {/* Sprint 4 T2 — asistencia del mes + próxima práctica */}
      <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-2 gap-3">
        <Link
          href={`/progress?student=${student.id}`}
          className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col"
        >
          <span
            className="text-[11px] uppercase tracking-wide font-medium"
            style={{ color: "var(--portesco-gray-mid)" }}
          >
            Asistencia de {monthName}
          </span>
          <span className="text-lg font-semibold text-gray-900">
            {summary.closed === 0 ? "—" : `${summary.attended} de ${summary.closed}`}
          </span>
          <span className="text-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>
            {summary.closed === 0 ? "Sin clases cerradas aún" : "clases · ver detalle"}
          </span>
        </Link>
        <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
          <span
            className="text-[11px] uppercase tracking-wide font-medium"
            style={{ color: "var(--portesco-gray-mid)" }}
          >
            Próxima práctica
          </span>
          <span className="text-sm font-semibold text-gray-900 leading-snug">
            {nextLabel ?? "Sin prácticas programadas"}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
        <p
          className="text-xs uppercase tracking-wide font-medium"
          style={{ color: "var(--portesco-gray-mid)" }}
        >
          Actividades
        </p>
        {activities.length === 0 ? (
          <p
            className="text-sm"
            style={{ color: "var(--portesco-gray-mid)" }}
          >
            Sin actividades activas
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  return (
    <li className="flex items-stretch gap-3">
      <span
        aria-hidden
        className="w-1 rounded-full shrink-0"
        style={{ backgroundColor: CATEGORY_COLOR[activity.category] }}
      />
      <div className="flex flex-col py-1">
        <p className="text-sm font-medium text-gray-900">{activity.name}</p>
        {activity.schedule && (
          <p
            className="text-xs"
            style={{ color: "var(--portesco-gray-mid)" }}
          >
            {activity.schedule}
          </p>
        )}
      </div>
    </li>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="w-12 h-12 rounded-full object-cover"
      />
    );
  }
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
      style={{ backgroundColor: "var(--portesco-blue)" }}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
      <p
        className="text-sm"
        style={{ color: "var(--portesco-gray-mid)" }}
      >
        Aún no tienes estudiantes registrados. Contacta a tu coordinadora.
      </p>
    </div>
  );
}
