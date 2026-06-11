// lib/ai/pipeline.ts — orquestación INLINE del pipeline de observación de voz.
//
// Architecture §4.2 / §8. Corre dentro del request (maxDuration=60, Vercel
// Hobby): transcripción → extracción → mention_assignments → el trigger DB
// puebla profile_observations. Máquina de estados en class_observations.
//
// Compliance:
//   - Opción 2: transcript_raw (crudo, con nombres) va a class_observations
//     (tabla con RLS de menores); audit_logs guarda el redactado (whisper.ts).
//   - Claude recibe input redactado (claude.ts); cada call audita aun si falla
//     (§3.3, hardening de Tarea 7.A).
//   - El mapeo placeholder→student_id y el unredact del snippet: map-mentions.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

import { transcribeVoice } from "@/lib/ai/whisper";
import { callClaude } from "@/lib/ai/claude";
import { mapMentionsToStudents } from "@/lib/ai/map-mentions";
import type { Kid } from "@/lib/ai/redact";
import {
  buildExtractionUserPrompt,
  EXTRACT_MENTIONS_SYSTEM,
  EXTRACT_MENTIONS_SCHEMA,
  type ExtractMentionsResult,
} from "@/lib/ai/prompts/extract-mentions-v1";

type RunArgs = {
  /** Service-role client (bypassa RLS — corre server-side). */
  supabase: SupabaseClient;
  observationId: string;
  sessionId: string;
  authorId: string;
  kind: "voice_group" | "text_group";
  /** voice: path en el bucket (voice-obs/{author}/{obsId}.{ext}). */
  audioStoragePath?: string;
  /** text: texto tipeado por el profe (modo Texto). */
  typedText?: string;
};

export type PipelineResult = {
  status: "pending_confirmation" | "transcription_failed" | "extraction_failed";
  extractionJson?: ExtractMentionsResult;
  mentionCount?: number;
  ambiguousCount?: number;
  error?: string;
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getKidsEnrolled(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Kid[]> {
  const { data: session } = await supabase
    .from("class_sessions")
    .select("activity_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return [];

  const { data: rows } = await supabase
    .from("enrollments")
    .select("student:students!inner(id, full_name)")
    .eq("activity_id", session.activity_id)
    .eq("status", "active");

  return (rows ?? []).map((r) => {
    const s = (Array.isArray(r.student) ? r.student[0] : r.student) as {
      id: string;
      full_name: string;
    };
    return { id: s.id, fullName: s.full_name };
  });
}

export async function runVoicePipeline(args: RunArgs): Promise<PipelineResult> {
  const { supabase, observationId, sessionId, authorId, kind } = args;
  const kidsEnrolled = await getKidsEnrolled(supabase, sessionId);

  // 1) Transcript (voz: Whisper; texto: lo tipeado).
  let transcript: string;
  if (kind === "voice_group") {
    if (!args.audioStoragePath) {
      await supabase
        .from("class_observations")
        .update({ extraction_status: "transcription_failed" })
        .eq("id", observationId);
      return { status: "transcription_failed", error: "missing audioStoragePath" };
    }
    try {
      const r = await transcribeVoice({
        audioStoragePath: args.audioStoragePath,
        userId: authorId,
        observationId,
        kidsEnrolled,
      });
      transcript = r.transcript;
    } catch (err) {
      await supabase
        .from("class_observations")
        .update({ extraction_status: "transcription_failed" })
        .eq("id", observationId);
      return { status: "transcription_failed", error: errMsg(err) };
    }
  } else {
    transcript = args.typedText ?? "";
  }

  // Opción 2: el transcript CRUDO va a la tabla con RLS (nunca a un log).
  await supabase
    .from("class_observations")
    .update({ transcript_raw: transcript, extraction_status: "pending_extraction" })
    .eq("id", observationId);

  // 2) Extracción (Claude redactado) → map → mention_assignments → trigger.
  try {
    const claudeRes = await callClaude<ExtractMentionsResult>({
      feature: "voice_extraction",
      systemPrompt: EXTRACT_MENTIONS_SYSTEM,
      userPrompt: buildExtractionUserPrompt(kidsEnrolled, transcript),
      contextDataForRedaction: { kidsEnrolled },
      userId: authorId,
      relatedObservationId: observationId,
      responseFormat: "json",
      jsonSchema: EXTRACT_MENTIONS_SCHEMA as unknown as Record<string, unknown>,
    });

    const extract = claudeRes.output;
    const { rows } = mapMentionsToStudents(
      extract,
      kidsEnrolled,
      claudeRes.redactionMappings
    );

    if (rows.length > 0) {
      const { error } = await supabase.from("mention_assignments").insert(
        rows.map((row) => ({ ...row, observation_id: observationId }))
      );
      // El trigger append_to_profile_observations puebla profile_observations.
      if (error) throw new Error(`mention_assignments insert: ${error.message}`);
    }

    await supabase
      .from("class_observations")
      .update({
        extraction_json: extract,
        extraction_status: "pending_confirmation",
      })
      .eq("id", observationId);

    return {
      status: "pending_confirmation",
      extractionJson: extract,
      mentionCount: rows.length,
      ambiguousCount: extract.ambiguous?.length ?? 0,
    };
  } catch (err) {
    await supabase
      .from("class_observations")
      .update({ extraction_status: "extraction_failed" })
      .eq("id", observationId);
    return { status: "extraction_failed", error: errMsg(err) };
  }
}
