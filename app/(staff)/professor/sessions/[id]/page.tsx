import Link from "next/link";
import { notFound } from "next/navigation";
import { Mic } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { categoryForGrade, CATEGORY_ORDER } from "@/lib/categories";
import { formatPanamaDate, formatPanamaTime } from "@/lib/dates";

// Professor session detail (Bloque 3) — READ-ONLY roster + sticky "Grabar".
//
// The professor's job in this surface is the group voice note, NOT attendance
// (that's the coordinator's Pad). So this page only lists the enrolled kids so
// the professor knows who's in the class, then a sticky button opens the
// recorder for this session.
//
// RLS: "class_sessions: professor select own" (0006) scopes the session;
// "students/enrollments: professor sees ... own activities" (0004) scope the
// roster. A session of an activity the professor doesn't teach returns null → 404.
type Kid = { id: string; fullName: string; grade: string };

export default async function ProfessorSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, scheduled_start_at, closed_at, activities!inner(id, name)")
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();

  const activity = (
    Array.isArray(session.activities) ? session.activities[0] : session.activities
  ) as { id: string; name: string };

  const { data: enrollmentRows } = await supabase
    .from("enrollments")
    .select("student:students!inner(id, full_name, grade)")
    .eq("activity_id", activity.id)
    .eq("status", "active");

  const kids: Kid[] = (enrollmentRows ?? []).map((row) => {
    const s = (Array.isArray(row.student) ? row.student[0] : row.student) as {
      id: string;
      full_name: string;
      grade: string;
    };
    return { id: s.id, fullName: s.full_name, grade: s.grade };
  });

  // Group by category, non-empty only, U14→U16→U18→Otros, alpha within group.
  const byCategory = new Map<string, Kid[]>();
  for (const kid of kids) {
    const category = categoryForGrade(kid.grade);
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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
      <div className="flex-1 space-y-4 px-4 py-4 pb-24">
        <header className="px-1">
          <h1 className="text-lg font-semibold text-foreground">
            {activity.name}
          </h1>
          <p className="text-sm text-[color:var(--portesco-gray-mid)]">
            {formatPanamaDate(start)} · {formatPanamaTime(start)} · {kids.length}{" "}
            estudiantes
          </p>
        </header>

        {groups.length > 0 ? (
          groups.map((group) => (
            <section key={group.category}>
              <h2 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
                {group.category}
              </h2>
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
                {group.kids.map((kid) => (
                  <li key={kid.id} className="px-3 py-2.5 text-sm text-foreground">
                    {kid.fullName}
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-[color:var(--portesco-gray-mid)]">
            No hay estudiantes activos en esta clase.
          </p>
        )}
      </div>

      {/* Sticky bottom — open the recorder for this session (pieza 4). */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-3">
        <Link
          href={`/professor/voice?session=${session.id}`}
          className="flex h-14 w-full items-center justify-center rounded-lg text-base font-semibold text-white"
          style={{ backgroundColor: "var(--portesco-blue)" }}
        >
          <Mic className="mr-2 size-5" />
          Grabar observación
        </Link>
      </div>
    </div>
  );
}
