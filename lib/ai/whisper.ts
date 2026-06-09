// lib/ai/whisper.ts — helper CENTRALIZADO de transcripción de voz.
//
// AGENTS.md §3.3 (NO NEGOCIABLE): toda call a Whisper escribe un row en
// audit_logs. Si algún code path llama al SDK de OpenAI directo sin pasar por
// transcribeVoice(), rebote en review.
//
// COMPLIANCE — decisión de Roberto (8 jun 2026), Opción 2:
//   La PII redaction pasa ANTES de Claude, NO antes de Whisper. O sea: el
//   transcript que Whisper devuelve tiene los nombres reales de los niños (y el
//   prompt de contexto también se los manda a Whisper para subir la precisión).
//   PERO en audit_logs feature='voice_transcription' guardamos el transcript
//   REDACTADO (corremos redactPII sobre él antes del INSERT). El transcript
//   CRUDO solo vuelve al caller para vivir en class_observations.transcript_raw
//   (tabla con RLS de menores, NO un log). Así audit_logs queda limpio de PII
//   cruda (§3.4 "Never log raw PII").
//
// Architecture §4.1. La función NO toca class_observations — eso lo orquesta
// /api/observations/voice (Tarea 7). transcribeVoice solo: descarga el audio,
// llama a whisper-1, escribe el audit row (redactado), y retorna.
import OpenAI, { toFile } from "openai";

import { redactPII, type Kid } from "@/lib/ai/redact";
import { createServiceClient } from "@/lib/supabase/service";

const VOICE_BUCKET = "voice-obs";
const WHISPER_MODEL = "whisper-1";

export type TranscribeArgs = {
  /** Path dentro del bucket voice-obs, ej. "voice-obs/{author}/{obsId}.m4a"
   *  o "{author}/{obsId}.m4a" (se normaliza el prefijo del bucket). */
  audioStoragePath: string;
  /** audit_logs.user_id — el autor (profesor) de la observación. */
  userId: string;
  /** audit_logs.related_observation_id. */
  observationId: string;
  /** Niños enrolled en la sesión: se usan (a) para el prompt de contexto que
   *  sube la precisión de Whisper con nombres panameños, y (b) para redactar
   *  el transcript antes de loggearlo (Opción 2). */
  kidsEnrolled: Kid[];
  /** Override opcional del prompt de Whisper. Default: nombres de kidsEnrolled. */
  contextHint?: string;
};

export type TranscribeResult = {
  /** Transcript CRUDO (con nombres reales). El caller lo guarda en
   *  class_observations.transcript_raw — NUNCA en un log. */
  transcript: string;
  language: string;
  latencyMs: number;
  inputDurationSeconds: number;
};

// ---------------------------------------------------------------------------
// Lógica pura (testeable sin llamar a OpenAI — el suite gratis la cubre con un
// transcript fixturado desde una corrida real).
// ---------------------------------------------------------------------------

/** Prompt de contexto para Whisper: lista de nombres para anclar la
 *  transcripción de nombres panameños / spanglish. Va a OpenAI (Whisper SÍ ve
 *  PII por diseño, Opción 2) pero NO se loggea crudo. */
export function buildContextHint(kidsEnrolled: Kid[]): string {
  const names = kidsEnrolled
    .map((k) => k.fullName.trim())
    .filter(Boolean);
  if (names.length === 0) return "";
  return `Nombres de los estudiantes mencionados: ${names.join(", ")}.`;
}

type WhisperSegment = { avg_logprob?: number };

/** Heurística coarse de confianza desde los avg_logprob por segmento de
 *  verbose_json. Rango típico ~[-1, 0]. Solo telemetría (audit_logs.ai_confidence
 *  es text). Devuelve null si no hay segmentos. */
export function deriveConfidenceLabel(
  segments: WhisperSegment[] | undefined | null
): "high" | "medium" | "low" | null {
  if (!segments || segments.length === 0) return null;
  const vals = segments
    .map((s) => s.avg_logprob)
    .filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean >= -0.3) return "high";
  if (mean >= -0.6) return "medium";
  return "low";
}

export type TranscriptionAuditRow = {
  user_id: string;
  feature: "voice_transcription";
  input_raw: null;
  input_redacted: null;
  ai_output: string; // transcript REDACTADO (Opción 2)
  data_classification: "pii";
  model_name: string;
  model_version: null;
  input_tokens: null;
  output_tokens: null;
  latency_ms: number;
  ai_confidence: "high" | "medium" | "low" | null;
  related_observation_id: string;
  metadata: {
    language: string;
    duration_seconds: number;
    kids_in_context: number;
    redaction_placeholders: number;
  };
};

/** Arma el row de audit_logs para una transcripción. Redacta el transcript
 *  (Opción 2) y NO incluye PII cruda en ningún campo ni en metadata. */
export function buildTranscriptionAuditRow(input: {
  userId: string;
  observationId: string;
  rawTranscript: string;
  kidsEnrolled: Kid[];
  language: string;
  durationSeconds: number;
  latencyMs: number;
  confidence: "high" | "medium" | "low" | null;
}): TranscriptionAuditRow {
  const { redactedText, mappings } = redactPII(input.rawTranscript, {
    kidsEnrolled: input.kidsEnrolled,
  });
  return {
    user_id: input.userId,
    feature: "voice_transcription",
    input_raw: null,
    input_redacted: null,
    ai_output: redactedText,
    data_classification: "pii",
    model_name: WHISPER_MODEL,
    model_version: null,
    input_tokens: null,
    output_tokens: null,
    latency_ms: input.latencyMs,
    ai_confidence: input.confidence,
    related_observation_id: input.observationId,
    metadata: {
      language: input.language,
      duration_seconds: input.durationSeconds,
      kids_in_context: input.kidsEnrolled.length,
      redaction_placeholders: Object.keys(mappings).length,
    },
  };
}

/** Normaliza el path quitando el prefijo del bucket si viene incluido, y
 *  devuelve también el filename (con extensión) que OpenAI usa para inferir el
 *  formato del audio. */
export function parseStoragePath(audioStoragePath: string): {
  objectPath: string;
  fileName: string;
} {
  const objectPath = audioStoragePath.replace(
    new RegExp(`^${VOICE_BUCKET}/`),
    ""
  );
  const fileName = objectPath.split("/").pop() || "audio";
  return { objectPath, fileName };
}

// ---------------------------------------------------------------------------
// Side-effecting: descarga + Whisper + audit INSERT.
// ---------------------------------------------------------------------------

export async function transcribeVoice(
  args: TranscribeArgs
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("transcribeVoice: missing OPENAI_API_KEY");

  const supabase = createServiceClient();
  const { objectPath, fileName } = parseStoragePath(args.audioStoragePath);

  // 1) Descargar el audio del bucket privado (service_role bypassa RLS).
  const { data: blob, error: dlError } = await supabase.storage
    .from(VOICE_BUCKET)
    .download(objectPath);
  if (dlError || !blob) {
    throw new Error(
      `transcribeVoice: download failed for ${objectPath}: ${dlError?.message ?? "no data"}`
    );
  }

  // 2) Whisper-1, español, con prompt de contexto (nombres). verbose_json para
  //    obtener language + duration + segments (confidence).
  const openai = new OpenAI({ apiKey });
  const file = await toFile(blob, fileName);
  const contextHint = args.contextHint ?? buildContextHint(args.kidsEnrolled);

  const startedAt = Date.now();
  const result = await openai.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    language: "es",
    prompt: contextHint || undefined,
    response_format: "verbose_json",
  });
  const latencyMs = Date.now() - startedAt;

  // verbose_json → { text, language, duration, segments }
  const rawTranscript = result.text ?? "";
  const language = result.language ?? "es";
  const durationSeconds = Math.round(result.duration ?? 0);
  const confidence = deriveConfidenceLabel(
    result.segments as WhisperSegment[] | undefined
  );

  // 3) audit_logs (Opción 2: transcript redactado). service_role bypassa la
  //    RLS de audit_logs (solo tiene policy admin-read).
  const auditRow = buildTranscriptionAuditRow({
    userId: args.userId,
    observationId: args.observationId,
    rawTranscript,
    kidsEnrolled: args.kidsEnrolled,
    language,
    durationSeconds,
    latencyMs,
    confidence,
  });
  const { error: auditError } = await supabase.from("audit_logs").insert(auditRow);
  if (auditError) {
    // §3.3 es no-negociable: si no podemos loggear, fallamos en vez de
    // devolver un transcript sin rastro de auditoría.
    throw new Error(`transcribeVoice: audit_logs insert failed: ${auditError.message}`);
  }

  // 4) Devolver el transcript CRUDO al caller (→ class_observations.transcript_raw).
  return {
    transcript: rawTranscript,
    language,
    latencyMs,
    inputDurationSeconds: durationSeconds,
  };
}
