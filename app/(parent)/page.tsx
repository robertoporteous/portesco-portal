import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
          {students.map((student) => (
            <StudentCard key={student.id} student={student} />
          ))}
        </div>
      )}
    </div>
  );
}

function StudentCard({ student }: { student: Student }) {
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
