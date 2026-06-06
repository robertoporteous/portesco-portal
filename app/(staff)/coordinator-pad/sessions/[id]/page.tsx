import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { categoryForGrade, CATEGORY_ORDER } from "@/lib/categories";
import { formatPanamaDate, formatPanamaTime } from "@/lib/dates";
import type { AttendanceStatus } from "@/lib/types";

import { AttendanceList, type Kid } from "./attendance-list";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Session + activity. RLS (class_sessions coordinator policy) scopes to the
  // coordinator's school; a session of another school returns null → 404 (we
  // don't leak existence). The activity embed is to-one but typed as array.
  const { data: session } = await supabase
    .from("class_sessions")
    .select(
      "id, scheduled_start_at, scheduled_end_at, closed_at, activities!inner(id, name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();

  const activity = (
    Array.isArray(session.activities) ? session.activities[0] : session.activities
  ) as { id: string; name: string };

  // Enrolled kids + existing attendance for this session (in parallel).
  const [{ data: enrollmentRows }, { data: attendanceRows }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student:students!inner(id, full_name, grade)")
      .eq("activity_id", activity.id)
      .eq("status", "active"),
    supabase
      .from("class_attendance")
      .select("student_id, status")
      .eq("session_id", id),
  ]);

  const statusByStudent = new Map<string, AttendanceStatus>(
    (attendanceRows ?? []).map((a) => [
      a.student_id as string,
      a.status as AttendanceStatus,
    ])
  );

  // Normalize the enrollments embed (student is to-one, typed as array).
  const kids: Kid[] = (enrollmentRows ?? []).map((row) => {
    const s = (Array.isArray(row.student) ? row.student[0] : row.student) as {
      id: string;
      full_name: string;
      grade: string;
    };
    return {
      id: s.id,
      fullName: s.full_name,
      status: statusByStudent.get(s.id) ?? null,
    };
  });

  // Group by category, keep only non-empty groups, ordered U14→U16→U18→Otros,
  // alphabetical within each group.
  const byCategory = new Map<string, Kid[]>();
  for (const enrollment of enrollmentRows ?? []) {
    const s = (
      Array.isArray(enrollment.student) ? enrollment.student[0] : enrollment.student
    ) as { id: string; grade: string };
    const category = categoryForGrade(s.grade);
    const kid = kids.find((k) => k.id === s.id)!;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(kid);
  }
  const groups = CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => ({
    category,
    kids: byCategory
      .get(category)!
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es")),
  }));

  const start = new Date(session.scheduled_start_at);

  return (
    <AttendanceList
      sessionId={session.id}
      activityName={activity.name}
      // DEBT(bloque-3): professor name omitted (RLS — see AGENTS.md §12).
      headerDate={formatPanamaDate(start)}
      headerTime={formatPanamaTime(start)}
      totalKids={kids.length}
      groups={groups}
      initiallyClosed={!!session.closed_at}
    />
  );
}
