// POST /api/observations/voice — sube la observación grupal (voz o texto) y
// corre el pipeline inline (transcripción → extracción → mention_assignments).
//
// maxDuration: Vercel HOBBY tiene techo de 60s. El pipeline corre inline dentro
// de este límite (por eso el recorder cap es 5 min, no 8). Se revisa post-Tarea 12.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mimeToExt } from "@/lib/audio";
import { runVoicePipeline } from "@/lib/ai/pipeline";

export async function POST(req: NextRequest) {
  // 1) Auth — user client (RLS). Nunca service role para autenticar.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const sessionId = String(form.get("sessionId") ?? "");
  const mode = String(form.get("mode") ?? "voz");
  const text = String(form.get("text") ?? "");
  const audio = form.get("audio");

  if (!sessionId) {
    return NextResponse.json({ error: "missing sessionId" }, { status: 400 });
  }

  // 2) Ownership SERVER-SIDE (guardrail #3): la sesión debe ser visible para
  //    ESTE usuario vía RLS (professor select own / coordinator school / admin).
  //    No confiamos en el ?session= del cliente.
  const { data: session } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const kind = mode === "texto" ? "text_group" : "voice_group";

  if (kind === "text_group" && !text.trim()) {
    return NextResponse.json({ error: "missing text" }, { status: 400 });
  }
  if (kind === "voice_group" && !(audio instanceof File)) {
    return NextResponse.json({ error: "missing audio" }, { status: 400 });
  }

  // 3) Writes con service role (bypassa RLS; el ownership ya quedó validado).
  const service = createServiceClient();

  const { data: obs, error: obsErr } = await service
    .from("class_observations")
    .insert({
      session_id: sessionId,
      author_id: user.id,
      kind,
      extraction_status: "pending_transcription",
    })
    .select("id")
    .single();
  if (obsErr || !obs) {
    return NextResponse.json(
      { error: `insert failed: ${obsErr?.message ?? "no row"}` },
      { status: 500 }
    );
  }
  const observationId = obs.id as string;

  // Upload del audio (voz). Path: voice-obs/{author_id}/{observation_id}.{ext}.
  let audioStoragePath: string | undefined;
  if (kind === "voice_group" && audio instanceof File) {
    const ext = mimeToExt(audio.type);
    const objectPath = `${user.id}/${observationId}.${ext}`;
    const { error: upErr } = await service.storage
      .from("voice-obs")
      .upload(objectPath, audio, { contentType: audio.type, upsert: true });
    if (upErr) {
      await service
        .from("class_observations")
        .update({ extraction_status: "transcription_failed" })
        .eq("id", observationId);
      return NextResponse.json(
        { error: `upload failed: ${upErr.message}` },
        { status: 500 }
      );
    }
    audioStoragePath = `voice-obs/${objectPath}`;
  }

  // 4) Pipeline inline. La respuesta lleva status final + extraction_json, así
  //    el modal de confirmación (Tarea 8) puede abrir desde acá (realtime = fallback).
  const result = await runVoicePipeline({
    supabase: service,
    observationId,
    sessionId,
    authorId: user.id,
    kind,
    audioStoragePath,
    typedText: text,
  });

  return NextResponse.json({ observationId, ...result });
}
