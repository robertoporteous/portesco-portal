// PATCH /api/observations/[id]/confirm — el profesor confirma (flujo A) el set
// revisado de menciones de una observación de voz. Recién ACÁ se insertan
// mention_assignments → el trigger append_to_profile_observations puebla
// profile_observations. Antes de confirmar, la observación es inerte.
//
// Garantías:
//   - Ownership server-side: solo el author ve/confirma su observación (403).
//   - Idempotente: solo procede desde extraction_status='pending_confirmation';
//     el flip de estado es un compare-and-set atómico (claim) para que un doble
//     confirm no duplique inserts (relevante para el perfil de un menor).
//   - Sin audit_logs: no hay call a un LLM en el confirm (AGENTS §3.3).
//   - NO enforza closed_at: la observación de voz es post-clase por diseño
//     (como las eventualidades). La deuda §12 Y2 queda scopeada a attendance.
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getKidsEnrolled } from "@/lib/ai/pipeline";
import {
  buildConfirmedRows,
  ConfirmValidationError,
  type ConfirmDelta,
  type ConfirmMentionDecision,
  type ConfirmAmbiguousDecision,
  type MentionSentiment,
} from "@/lib/ai/confirm-mentions";
import type { ConfirmationPayload } from "@/lib/ai/map-mentions";

const SENTIMENTS: MentionSentiment[] = [
  "positive",
  "neutral",
  "concern",
  "negative",
];

// Validación a mano del body (mismo patrón que el route hermano voice/route.ts;
// no dependemos de zod, que acá es solo transitivo). Devuelve el delta tipado o
// null si la forma es inválida.
function parseDelta(raw: unknown): ConfirmDelta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const mentionsRaw = obj.mentions ?? [];
  const ambiguousRaw = obj.ambiguous ?? [];
  if (!Array.isArray(mentionsRaw) || !Array.isArray(ambiguousRaw)) return null;

  const isIdx = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 0;
  const isSentiment = (v: unknown): v is MentionSentiment =>
    typeof v === "string" && (SENTIMENTS as string[]).includes(v);

  const mentions: ConfirmMentionDecision[] = [];
  for (const m of mentionsRaw) {
    if (typeof m !== "object" || m === null) return null;
    const d = m as Record<string, unknown>;
    if (!isIdx(d.idx)) return null;
    if (d.action !== "keep" && d.action !== "edit" && d.action !== "discard") {
      return null;
    }
    if (d.student_id !== undefined && typeof d.student_id !== "string") {
      return null;
    }
    if (d.sentiment !== undefined && !isSentiment(d.sentiment)) return null;
    mentions.push({
      idx: d.idx,
      action: d.action,
      student_id: d.student_id as string | undefined,
      sentiment: d.sentiment as MentionSentiment | undefined,
    });
  }

  const ambiguous: ConfirmAmbiguousDecision[] = [];
  for (const a of ambiguousRaw) {
    if (typeof a !== "object" || a === null) return null;
    const d = a as Record<string, unknown>;
    if (!isIdx(d.idx)) return null;
    if (d.student_id !== null && typeof d.student_id !== "string") return null;
    if (d.sentiment !== undefined && !isSentiment(d.sentiment)) return null;
    ambiguous.push({
      idx: d.idx,
      student_id: d.student_id as string | null,
      sentiment: d.sentiment as MentionSentiment | undefined,
    });
  }

  return { mentions, ambiguous };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1) Auth — user client (RLS). Nunca service role para autenticar.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Ownership SERVER-SIDE: leemos con el user client (RLS author select).
  //    Si el observation no es del profe, ni lo ve → 403. Chequeo explícito de
  //    author_id como segunda línea (defense in depth).
  const { data: obs } = await supabase
    .from("class_observations")
    .select("id, session_id, author_id, extraction_status, extraction_json")
    .eq("id", id)
    .maybeSingle();
  if (!obs || obs.author_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 3) Idempotencia (fast path): ya confirmada → no-op; otro estado → 409.
  if (obs.extraction_status === "confirmed") {
    return NextResponse.json({
      observationId: id,
      status: "confirmed",
      alreadyConfirmed: true,
    });
  }
  if (obs.extraction_status !== "pending_confirmation") {
    return NextResponse.json(
      { error: `not confirmable in status ${obs.extraction_status}` },
      { status: 409 }
    );
  }

  // 4) Parse del delta.
  const raw = await req.json().catch(() => null);
  const delta = parseDelta(raw);
  if (!delta) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const resolved = obs.extraction_json as ConfirmationPayload | null;
  if (!resolved || !Array.isArray(resolved.mentions)) {
    return NextResponse.json(
      { error: "no extraction to confirm" },
      { status: 409 }
    );
  }

  // 5) Roster REAL (service role, ownership ya validado) para revalidar ids.
  const service = createServiceClient();
  const kids = await getKidsEnrolled(service, obs.session_id);
  const rosterIds = new Set(kids.map((k) => k.id));

  let rows;
  try {
    rows = buildConfirmedRows(resolved, delta, rosterIds);
  } catch (err) {
    if (err instanceof ConfirmValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // 6) Claim atómico: solo la request que hace pending→confirmed inserta. Un
  //    doble confirm concurrente pierde el claim y sale idempotente (sin
  //    duplicar mention_assignments → sin duplicar profile_observations).
  const { data: claimed } = await service
    .from("class_observations")
    .update({
      extraction_status: "confirmed",
      confirmation_ts: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("extraction_status", "pending_confirmation")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({
      observationId: id,
      status: "confirmed",
      alreadyConfirmed: true,
    });
  }

  // 7) INSERT del set confirmado → dispara el trigger que puebla el perfil.
  if (rows.length > 0) {
    const { error } = await service.from("mention_assignments").insert(
      rows.map((row) => ({ ...row, observation_id: id }))
    );
    if (error) {
      return NextResponse.json(
        { error: `insert failed: ${error.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    observationId: id,
    status: "confirmed",
    mentionCount: rows.length,
    correctedCount: rows.filter((r) => r.professor_corrected).length,
  });
}
