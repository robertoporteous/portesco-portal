"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// SPIKE del recorder (Bloque 3 · Tarea 1). Client-only: graba con MediaRecorder,
// reproduce en pantalla, y muestra el MIME real + duración + tamaño. NO sube al
// bucket todavía (eso es Tarea 7). Este componente es el EMBRIÓN del recorder
// productivo de voice/page.tsx (Tarea 6), no un throwaway.
//
// Decisiones ya tomadas (sprint Bloque 3):
//  - TAP-INICIAR / TAP-PARAR como gesto primario (NO hold-to-record).
//  - El codec lo elige el browser (Safari iOS → audio/mp4 AAC; Chrome → webm).
//    No forzamos mimeType; leemos recorder.mimeType real y derivamos el ext.
//  - Path convention futura: voice-obs/{author_id}/{observation_id}.{ext}.
//
// Hallazgo del spike (validado iPhone Safari iOS, 8 jun 2026, admin):
//  - MIME real iOS = audio/mp4; codecs=mp4a.40.2 → ext .m4a.
//  - El recorder SOBREVIVE al bloqueo/dimeo de pantalla (estado "recording" al
//    volver, nunca "inactive") → tap/tap + lock-survive confirmados en device.
//  - Peso ≈ 1.35 MB/min (AAC). HARD CAP de grabación = 8 min (Tarea 6) →
//    ~10.8 MB worst case. Por eso el bucket voice-obs se subió a 15 MB en
//    Supabase Studio (cero código). El cap de 8 min sigue válido contra 15 MB.
//    TODO(Tarea 6): enforce el hard cap de 8 min en el recorder productivo.

// MIME real (sin el parámetro ;codecs=...) → extensión de archivo para el path.
// El bucket voice-obs whitelistea audio/webm, audio/mp4, audio/mpeg.
function mimeToExt(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/aac":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    default:
      // Fallback: segunda mitad del MIME, sin caracteres raros.
      return base.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
  }
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type Phase = "idle" | "recording" | "stopped" | "error";

type Recording = {
  url: string;
  mime: string;
  ext: string;
  sizeBytes: number;
  durationSec: number;
};

type Interruption = {
  hiddenAtSec: number;
  recoveredState: string | null;
};

export function VoiceRecorder() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [interruptions, setInterruptions] = useState<Interruption[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startMsRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // elapsedSec is mirrored into a ref so the visibilitychange listener (bound
  // once) can stamp interruptions without re-subscribing on every tick.
  const elapsedRef = useRef(0);

  // Feature detection (client-only). iOS Safari < 14.5 carece de MediaRecorder.
  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    setSupported(ok);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Detecta bloqueo/dimeo de pantalla mid-grabación (exit criterion del spike:
  // "intenta bloquear la pantalla → reportar si sobrevive o muere"). No podemos
  // forzar que iOS no suspenda MediaRecorder, pero sí registramos el evento y el
  // estado del recorder al volver, para que Roberto reporte el comportamiento real.
  useEffect(() => {
    function onVisibility() {
      if (recorderRef.current?.state === "recording" && document.hidden) {
        setInterruptions((prev) => [
          ...prev,
          { hiddenAtSec: elapsedRef.current, recoveredState: null },
        ]);
      } else if (!document.hidden) {
        setInterruptions((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.recoveredState !== null) return prev;
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            recoveredState: recorderRef.current?.state ?? "inactive",
          };
          return updated;
        });
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Cleanup en unmount: para tracks y revoca el objectURL.
  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      if (recording?.url) URL.revokeObjectURL(recording.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    setErrorMsg(null);
    setInterruptions([]);
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Sin mimeType forzado: el browser elige el mejor codec nativo.
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = (e: Event) => {
        const err = (e as unknown as { error?: DOMException }).error;
        setErrorMsg(`MediaRecorder error: ${err?.name ?? "desconocido"}`);
        setPhase("error");
        clearTimer();
        stopTracks();
      };

      recorder.onstop = () => {
        clearTimer();
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        setRecording({
          url,
          mime,
          ext: mimeToExt(mime),
          sizeBytes: blob.size,
          durationSec: Math.round((Date.now() - startMsRef.current) / 1000),
        });
        setPhase("stopped");
        stopTracks();
      };

      // timeslice 1s: chunks periódicos → más robusto en grabaciones largas
      // (3-5 min) y resiliente a interrupciones puntuales.
      recorder.start(1000);
      startMsRef.current = Date.now();
      setElapsedSec(0);
      elapsedRef.current = 0;
      setPhase("recording");
      clearTimer();
      timerRef.current = setInterval(() => {
        const secs = Math.round((Date.now() - startMsRef.current) / 1000);
        elapsedRef.current = secs;
        setElapsedSec(secs);
      }, 250);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "Error";
      const msg =
        name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Habilitalo en ajustes de Safari."
          : name === "NotFoundError"
            ? "No se encontró micrófono."
            : `No se pudo iniciar la grabación (${name}).`;
      setErrorMsg(msg);
      setPhase("error");
      stopTracks();
    }
  }, [recording, clearTimer, stopTracks]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setInterruptions([]);
    setErrorMsg(null);
    setPhase("idle");
    setElapsedSec(0);
    elapsedRef.current = 0;
  }, [recording]);

  // ---- Fallback cuando MediaRecorder no está disponible (exit criterion) ----
  if (supported === false) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <TriangleAlert className="h-4 w-4" />
          MediaRecorder no disponible en este navegador
        </p>
        <p className="mt-2 text-sm text-amber-700">
          Fallback: grabá con la app de voz del teléfono y subí el archivo.
        </p>
        <label className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-lg border border-amber-400 bg-white px-4 py-3 text-sm font-medium text-amber-800">
          <input type="file" accept="audio/*" capture className="hidden" />
          Seleccionar / grabar audio
        </label>
      </div>
    );
  }

  if (supported === null) {
    return <p className="text-sm text-[color:var(--portesco-gray-mid)]">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Cronómetro + indicador de grabación */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div
          className={cn(
            "flex h-32 w-32 items-center justify-center rounded-full border-4 transition-colors",
            phase === "recording"
              ? "border-red-500 bg-red-50"
              : "border-gray-200 bg-gray-50"
          )}
        >
          <span className="text-3xl font-semibold tabular-nums text-[color:var(--portesco-blue)]">
            {formatClock(elapsedSec)}
          </span>
        </div>
        {phase === "recording" && (
          <span className="flex items-center gap-2 text-sm font-medium text-red-600">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
            Grabando…
          </span>
        )}
      </div>

      {/* Controles tap-iniciar / tap-parar */}
      {phase !== "recording" ? (
        <Button
          onClick={start}
          className="h-16 w-full text-base font-semibold"
          style={{ backgroundColor: "var(--portesco-blue)" }}
        >
          <Mic className="mr-2 h-5 w-5" />
          {phase === "stopped" || phase === "error" ? "Grabar de nuevo" : "Iniciar grabación"}
        </Button>
      ) : (
        <Button
          onClick={stop}
          variant="destructive"
          className="h-16 w-full text-base font-semibold"
        >
          <Square className="mr-2 h-5 w-5 fill-current" />
          Parar
        </Button>
      )}

      {errorMsg && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMsg}
        </p>
      )}

      {/* Reproducción + metadata real (lo que valida el spike) */}
      {recording && (
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <audio controls src={recording.url} className="w-full" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-[color:var(--portesco-gray-mid)]">MIME real</dt>
            <dd className="break-all font-mono text-xs">{recording.mime}</dd>
            <dt className="text-[color:var(--portesco-gray-mid)]">Extensión (path)</dt>
            <dd className="font-mono">.{recording.ext}</dd>
            <dt className="text-[color:var(--portesco-gray-mid)]">Duración</dt>
            <dd className="tabular-nums">{formatClock(recording.durationSec)}</dd>
            <dt className="text-[color:var(--portesco-gray-mid)]">Tamaño</dt>
            <dd className="tabular-nums">{formatSize(recording.sizeBytes)}</dd>
          </dl>

          <Button onClick={reset} variant="outline" className="w-full">
            <RotateCcw className="mr-2 h-4 w-4" />
            Descartar
          </Button>
        </div>
      )}

      {/* Reporte de interrupciones (bloqueo/dimeo de pantalla) */}
      {interruptions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            Interrupciones de pantalla detectadas: {interruptions.length}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            {interruptions.map((it, i) => (
              <li key={i}>
                A los {formatClock(it.hiddenAtSec)} → al volver el recorder estaba:{" "}
                <span className="font-mono font-semibold">
                  {it.recoveredState ?? "(sin volver aún)"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-600">
            Si el estado al volver es <span className="font-mono">recording</span>, el
            recorder sobrevivió. Si es <span className="font-mono">inactive</span>, murió
            al bloquear.
          </p>
        </div>
      )}
    </div>
  );
}
