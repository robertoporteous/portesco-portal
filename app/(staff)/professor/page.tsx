import Link from "next/link";
import { CalendarDays, ChevronRight, Mic } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  formatPanamaDate,
  formatPanamaNextSession,
  formatPanamaTime,
  panamaTodayRange,
} from "@/lib/dates";

// Professor surface (Bloque 3) — "Mis clases hoy".
//
// RLS scopes the result to the professor's own sessions via the
// "class_sessions: professor select own" policy (activity_id in
// user_activity_ids_as_professor(), migration 0006). No client-side role
// filtering needed. "Hoy" is computed in America/Panama (lib/dates), same as
// the Coordinator Pad — Vercel runs UTC, so a UTC "today" would shift the day.
type TodaySession = {
  id: string;
  scheduled_start_at: string;
  closed_at: string | null;
  activities: {
    name: string;
    enrollments: { count: number }[];
  };
};

export default async function ProfessorTodayPage() {
  const supabase = await createClient();
  const now = new Date();
  const { start, end } = panamaTodayRange();

  const { data: todayRows } = await supabase
    .from("class_sessions")
    .select(
      "id, scheduled_start_at, closed_at, activities!inner(name, enrollments(count))"
    )
    .gte("scheduled_start_at", start.toISOString())
    .lt("scheduled_start_at", end.toISOString())
    .order("scheduled_start_at");

  const sessions = (todayRows ?? []) as unknown as TodaySession[];

  let nextSessionAt: string | null = null;
  if (sessions.length === 0) {
    const { data: next } = await supabase
      .from("class_sessions")
      .select("scheduled_start_at")
      .gte("scheduled_start_at", now.toISOString())
      .order("scheduled_start_at")
      .limit(1)
      .maybeSingle();
    nextSessionAt = next?.scheduled_start_at ?? null;
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 py-4">
      <header className="px-1 pb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
          Profesor
        </p>
        <h1 className="text-lg font-semibold text-foreground">
          Mis clases · Hoy {formatPanamaDate(now)}
        </h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-[color:var(--portesco-blue)]" />
            Hoy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessions.length > 0 ? (
            sessions.map((s) => {
              const startAt = new Date(s.scheduled_start_at);
              const count = s.activities.enrollments?.[0]?.count ?? 0;
              return (
                <Link
                  key={s.id}
                  href={`/professor/sessions/${s.id}`}
                  className="flex items-start gap-2.5 rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50"
                >
                  <Mic className="mt-0.5 size-4 shrink-0 text-[color:var(--portesco-blue)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {s.activities.name} · {formatPanamaTime(startAt)}
                    </p>
                    <p className="text-xs text-[color:var(--portesco-gray-mid)]">
                      {count} estudiantes
                    </p>
                  </div>
                  {s.closed_at && <Badge variant="secondary">Cerrada</Badge>}
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-[color:var(--portesco-gray-mid)]" />
                </Link>
              );
            })
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm font-medium text-foreground">
                No tenés clases hoy
              </p>
              <p className="mt-1 text-xs text-[color:var(--portesco-gray-mid)]">
                {nextSessionAt
                  ? `Próxima: ${formatPanamaNextSession(new Date(nextSessionAt))}`
                  : "No hay próximas clases programadas"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
