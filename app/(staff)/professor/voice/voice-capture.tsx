"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VoiceRecorder, type RecordingPayload } from "./voice-recorder";

const TEXT_MAX = 2000;

type SubmitResult = {
  observationId: string;
  status:
    | "pending_confirmation"
    | "transcription_failed"
    | "extraction_failed";
  mentionCount?: number;
  ambiguousCount?: number;
  error?: string;
};

// Voz/Texto capture shell (Bloque 3, Tarea 6 pieza 4). CLIENT-ONLY: graba o
// escribe la observación grupal. La SUBIDA al bucket + pipeline async es Tarea 7
// — por eso "Enviar" queda deshabilitado acá (seam de integración listo: el
// recorder ya expone el blob vía onRecordingChange).
export function VoiceCapture({
  sessionId,
  sessionLabel,
}: {
  sessionId?: string;
  sessionLabel?: string;
}) {
  const [tab, setTab] = useState<"voz" | "texto">("voz");
  const [recording, setRecording] = useState<RecordingPayload | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasContent = tab === "voz" ? !!recording : text.trim().length > 0;
  // Idempotencia: nada de re-enviar una vez procesado ok; sin sesión no se sube.
  const done = result?.status === "pending_confirmation";
  const canSubmit = hasContent && !!sessionId && !submitting && !done;

  const submit = useCallback(async () => {
    if (!sessionId || submitting || done) return; // guard anti doble-tap
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("sessionId", sessionId);
      fd.append("mode", tab);
      if (tab === "texto") {
        fd.append("text", text.trim());
      } else if (recording) {
        fd.append("audio", recording.blob, `obs.${recording.ext}`);
      }
      const res = await fetch("/api/observations/voice", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as SubmitResult & { error?: string };
      if (!res.ok) {
        setErrorMsg(json.error ?? `Error ${res.status}`);
        setSubmitting(false); // permite reintentar
        return;
      }
      setResult(json);
      // No re-habilitamos: status final ya llegó (modal de confirmación = Tarea 8).
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error de red");
      setSubmitting(false);
    }
  }, [sessionId, submitting, done, tab, text, recording]);

  return (
    <div className="flex flex-col gap-5">
      {sessionLabel && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-foreground">
          Observación para: <span className="font-medium">{sessionLabel}</span>
        </p>
      )}

      {/* Segmented control Voz / Texto */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
        {(["voz", "texto"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md py-2 text-sm font-medium transition-colors",
              tab === t
                ? "bg-white text-[color:var(--portesco-blue)] shadow-sm"
                : "text-[color:var(--portesco-gray-mid)]"
            )}
          >
            {t === "voz" ? "Voz" : "Texto"}
          </button>
        ))}
      </div>

      {tab === "voz" ? (
        <VoiceRecorder onRecordingChange={setRecording} />
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
            rows={8}
            placeholder="Escribí tu observación grupal de la clase…"
            className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm text-foreground focus:border-[color:var(--portesco-blue)] focus:outline-none"
          />
          <span className="self-end text-xs text-[color:var(--portesco-gray-mid)]">
            {text.length}/{TEXT_MAX}
          </span>
        </div>
      )}

      {/* Enviar — POST a /api/observations/voice (pipeline inline). */}
      {!done && (
        <div className="flex flex-col gap-1.5">
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="h-14 w-full text-base font-semibold"
            style={{ backgroundColor: "var(--portesco-blue)" }}
            title={sessionId ? undefined : "Falta la sesión"}
          >
            {submitting ? "Procesando…" : "Enviar observación"}
          </Button>
          {!sessionId && (
            <p className="text-center text-xs text-[color:var(--portesco-gray-mid)]">
              Abrí esta pantalla desde una clase para asociar la observación.
            </p>
          )}
          {errorMsg && (
            <p className="text-center text-xs text-red-600">{errorMsg}</p>
          )}
        </div>
      )}

      {/* Resultado del pipeline. El modal de confirmación (Tarea 8) abre desde
          esta misma respuesta; acá mostramos un resumen mínimo. */}
      {result && result.status === "pending_confirmation" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Observación procesada</p>
          <p className="mt-1">
            {result.mentionCount ?? 0} menciones detectadas
            {result.ambiguousCount
              ? ` · ${result.ambiguousCount} ambiguas`
              : ""}{" "}
            · pendiente de confirmación.
          </p>
        </div>
      )}
      {result &&
        (result.status === "transcription_failed" ||
          result.status === "extraction_failed") && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-medium">
              {result.status === "transcription_failed"
                ? "Falló la transcripción"
                : "Falló la extracción"}
            </p>
            {result.error && <p className="mt-1 break-words">{result.error}</p>}
          </div>
        )}
    </div>
  );
}
