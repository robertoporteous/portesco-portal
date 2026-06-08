import { VoiceRecorder } from "./voice-recorder";

// SPIKE Bloque 3 · Tarea 1 — gate del bloque.
// Pantalla de grabación client-only. NO sube al bucket todavía (Tarea 7).
// Mobile-first iPhone vertical. Roberto la prueba en Safari iOS real, logueado
// como ADMIN, para validar:
//   - graba una nota CONTINUA de 3+ min sin cortarse
//   - bloquear/dimear la pantalla mid-grabación → reporta si sobrevive o muere
//   - reproduce la grabación
//   - el MIME real aparece en pantalla (para parametrizar el path + validar
//     contra los MIME del bucket voice-obs)
export default function ProfessorVoiceSpikePage() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-6">
      <header className="mb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
          Spike · grabación de voz
        </p>
        <h1 className="text-xl font-semibold text-[color:var(--portesco-blue)]">
          Observación de clase
        </h1>
        <p className="mt-1 text-sm text-[color:var(--portesco-gray-mid)]">
          Grabá tu nota grupal de 3–5 min. Tap para iniciar, tap para parar.
        </p>
      </header>

      <div className="mt-4 flex-1">
        <VoiceRecorder />
      </div>

      <p className="mt-6 text-center text-xs text-[color:var(--portesco-gray-mid)]">
        Spike de validación · todavía no sube al servidor
      </p>
    </div>
  );
}
