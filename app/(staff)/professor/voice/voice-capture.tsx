"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VoiceRecorder, type RecordingPayload } from "./voice-recorder";

const TEXT_MAX = 2000;

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

  const hasContent = tab === "voz" ? !!recording : text.trim().length > 0;

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

      {/* Enviar — deshabilitado hasta Tarea 7 (subida + pipeline). */}
      <div className="flex flex-col gap-1.5">
        <Button
          disabled={!hasContent}
          className="h-14 w-full text-base font-semibold"
          style={{ backgroundColor: "var(--portesco-blue)" }}
          // onClick: Tarea 7 — sube blob/texto a /api/observations/voice.
          title={sessionId ? undefined : "Falta la sesión"}
        >
          Enviar observación
        </Button>
        <p className="text-center text-xs text-[color:var(--portesco-gray-mid)]">
          La subida y el procesamiento se cablean en el siguiente paso.
        </p>
      </div>
    </div>
  );
}
