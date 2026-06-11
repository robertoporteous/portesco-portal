import { createClient } from "@/lib/supabase/server";
import { formatPanamaDate, formatPanamaTime } from "@/lib/dates";
import { VoiceCapture } from "./voice-capture";

// Professor voice capture (Bloque 3, Tarea 6 pieza 4) — recorder GRADUADO del
// spike (Tarea 1) con hard cap de 8 min + tab Voz/Texto. CLIENT-ONLY: la subida
// al bucket voice-obs + pipeline async es Tarea 7. Mobile-first iPhone vertical.
//
// Entra desde el sticky "Grabar" de la vista de sesión (?session=<id>). El label
// de la sesión se resuelve vía RLS (professor select own); si no es del profesor,
// no se attachea (Tarea 7 valida ownership server-side al subir).
export default async function ProfessorVoicePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: sessionId } = await searchParams;

  let sessionLabel: string | undefined;
  if (sessionId) {
    const supabase = await createClient();
    const { data: session } = await supabase
      .from("class_sessions")
      .select("scheduled_start_at, activities!inner(name)")
      .eq("id", sessionId)
      .maybeSingle();
    if (session) {
      const activity = (
        Array.isArray(session.activities)
          ? session.activities[0]
          : session.activities
      ) as { name: string };
      const start = new Date(session.scheduled_start_at);
      sessionLabel = `${activity.name} · ${formatPanamaDate(start)} ${formatPanamaTime(start)}`;
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-6">
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
          Profesor · observación de clase
        </p>
        <h1 className="text-xl font-semibold text-[color:var(--portesco-blue)]">
          Grabar o escribir
        </h1>
        <p className="mt-1 text-sm text-[color:var(--portesco-gray-mid)]">
          Tap para iniciar, tap para parar. Máximo 8 min.
        </p>
      </header>

      <div className="flex-1">
        <VoiceCapture sessionId={sessionId} sessionLabel={sessionLabel} />
      </div>
    </div>
  );
}
