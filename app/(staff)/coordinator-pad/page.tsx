import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardList,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptySection } from "@/components/shared/empty-section";
import { createClient } from "@/lib/supabase/server";
import {
  formatPanamaDate,
  formatPanamaNextSession,
  formatPanamaTime,
  panamaTodayRange,
} from "@/lib/dates";

// Shape of the HOY query result. The activities embed is to-one (returns an
// object); enrollments(count) is a to-many aggregate (returns [{ count }]).
type TodaySession = {
  id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  activities: {
    name: string;
    enrollments: { count: number }[];
  };
};

export default async function CoordinatorPadPage() {
  const supabase = await createClient();
  const now = new Date();
  const { start, end } = panamaTodayRange();

  // School name for the header (coordinator's school via RLS; admin may have none).
  const { data: staffRows } = await supabase
    .from("staff_schools")
    .select("school:schools(name)")
    .limit(1);
  // The embed is typed as an array by the generated types even though schools is
  // to-one; normalize either shape to a name.
  const schoolEmbed = staffRows?.[0]?.school as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const schoolName = Array.isArray(schoolEmbed)
    ? (schoolEmbed[0]?.name ?? null)
    : (schoolEmbed?.name ?? null);

  // HOY — today's sessions. RLS (class_sessions coordinator policy) scopes to the
  // coordinator's school; the date range scopes to today. No name matching, so
  // the demo "Fútbol" activity (which has no sessions) never appears.
  const { data: todayRows } = await supabase
    .from("class_sessions")
    .select(
      "id, scheduled_start_at, scheduled_end_at, activities!inner(name, enrollments(count))"
    )
    .gte("scheduled_start_at", start.toISOString())
    .lt("scheduled_start_at", end.toISOString())
    .order("scheduled_start_at");

  const sessions = (todayRows ?? []) as unknown as TodaySession[];

  // Next upcoming session — only needed to fill the HOY empty state.
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

  const total = sessions.length;
  const closed = 0; // Real close is a Server Action in Paso 5.

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col">
      <div className="flex-1 space-y-3 px-4 py-4">
        {/* Header */}
        <div className="px-1">
          <p className="text-sm font-semibold text-foreground">
            {schoolName ? `${schoolName} · ` : ""}Hoy {formatPanamaDate(now)}
          </p>
        </div>

        {/* HOY — wired */}
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
                    href={`/coordinator-pad/sessions/${s.id}`}
                    className="flex items-start gap-2.5 rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50"
                  >
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[color:var(--portesco-gray-mid)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {s.activities.name} · {formatPanamaTime(startAt)}
                      </p>
                      {/* DEBT(bloque-3): professor name ("· Alexander") omitted here.
                          RLS has no "users: coordinator sees staff (professor) of
                          own school" policy, so a coordinator cannot read the
                          professor's users.full_name. Needed in Bloque 3, where the
                          COLA section shows "voice notes de Alexander". Fix = add
                          that SELECT policy in the Sprint 3 RLS batch (migration 0009). */}
                      <p className="text-xs text-[color:var(--portesco-gray-mid)]">
                        {count} enrolled
                      </p>
                    </div>
                    <Badge variant="secondary">NO iniciada</Badge>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-[color:var(--portesco-gray-mid)]" />
                  </Link>
                );
              })
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm font-medium text-foreground">
                  No hay clases hoy
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

        {/* COLA DE REVISIÓN — not wired yet (Bloque 3) */}
        <Card>
          <CardContent className="p-0">
            <EmptySection icon={ClipboardList} title="Cola de revisión" />
          </CardContent>
        </Card>

        {/* REPORTES BI-SEMANALES — not wired yet (Bloque 4) */}
        <Card>
          <CardContent className="p-0">
            <EmptySection icon={BarChart3} title="Reportes bi-semanales" />
          </CardContent>
        </Card>

        {/* ALERTAS — not wired yet (Bloque 5) */}
        <Card>
          <CardContent className="p-0">
            <EmptySection icon={AlertTriangle} title="Alertas" />
          </CardContent>
        </Card>
      </div>

      {/* Sticky bottom — visual only; real close is a Server Action (Paso 5).
          Disabled when there are no sessions today. */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-3">
        <Button className="w-full" size="lg" disabled={total === 0}>
          Cerrar día ({closed}/{total} clases)
        </Button>
      </div>
    </div>
  );
}
