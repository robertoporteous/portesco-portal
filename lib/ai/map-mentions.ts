// lib/ai/map-mentions.ts — mapeo placeholder → student_id (correctness core).
//
// Claude devuelve menciones referenciando a cada niño por su placeholder token
// [STUDENT_N] (nunca por nombre ni student_id real — AGENTS §3.4). Acá las
// convertimos en filas listas para INSERT en mention_assignments.
//
// GUARDRAIL #1 (Tarea 7): el mapeo es [STUDENT_N] → kidsEnrolled[N-1].id.
// Esto es correcto porque redactPII numera los placeholders por ÍNDICE de
// kidsEnrolled (forEach((kid, i) => [STUDENT_${i+1}])), NO por orden de
// aparición en el texto. Ver tests/ai/map-mentions.test.ts (caso orden de
// mención ≠ orden de roster) y el test de index-numbering de redactPII.
import { unredactPII, type Kid, type RedactionMappings } from "@/lib/ai/redact";
import type { ExtractMentionsResult } from "@/lib/ai/prompts/extract-mentions-v1";

// Fila lista para INSERT en mention_assignments (el pipeline le agrega
// observation_id). content_snippet va UNREDACTADO (nombres reales) porque
// mention_assignments es tabla con RLS de menores, no un log.
export type MentionRow = {
  student_id: string;
  content_snippet: string;
  sentiment: "positive" | "neutral" | "concern" | "negative";
  ai_confidence: "high" | "medium" | "low";
};

export type SkippedMention = {
  student_ref: string;
  reason: "bad_token" | "index_out_of_range";
};

const STUDENT_REF = /^\[STUDENT_(\d+)\]$/;

export function mapMentionsToStudents(
  extract: ExtractMentionsResult,
  kidsEnrolled: Kid[],
  mappings: RedactionMappings
): { rows: MentionRow[]; skipped: SkippedMention[] } {
  const rows: MentionRow[] = [];
  const skipped: SkippedMention[] = [];

  for (const m of extract.mentions ?? []) {
    const match = STUDENT_REF.exec(m.student_ref.trim());
    if (!match) {
      skipped.push({ student_ref: m.student_ref, reason: "bad_token" });
      continue;
    }
    const index = Number(match[1]) - 1; // [STUDENT_1] → kidsEnrolled[0]
    if (index < 0 || index >= kidsEnrolled.length) {
      skipped.push({ student_ref: m.student_ref, reason: "index_out_of_range" });
      continue;
    }
    rows.push({
      student_id: kidsEnrolled[index].id,
      // Restaura nombres reales en el snippet para la tabla RLS de menores.
      content_snippet: unredactPII(m.content_snippet, mappings),
      sentiment: m.sentiment,
      ai_confidence: m.confidence,
    });
  }

  return { rows, skipped };
}

// ---------------------------------------------------------------------------
// Vista RESUELTA para el modal de confirmación (Tarea 8.1, flujo A).
//
// En flujo A el INSERT de mention_assignments se difiere a la CONFIRMACIÓN. En
// la extracción solo resolvemos nombres SERVER-SIDE (acá, donde viven los
// mappings) y persistimos esta vista en class_observations.extraction_json —
// tabla con RLS de menores, así que llevar nombres reales es correcto (mismo
// criterio que transcript_raw; audit_logs sigue redactado, Opción 2 intacta).
// El crudo redactado de Claude ya queda en audit_logs.ai_output.
// ---------------------------------------------------------------------------

// Resuelve un token [STUDENT_N] → kid del roster por índice (N-1). Mismo mapeo
// que mapMentionsToStudents (redactPII numera por índice de kidsEnrolled).
// Devuelve null si el token es inválido o el índice cae fuera del roster.
export function resolveStudentRef(
  ref: string,
  kidsEnrolled: Kid[]
): Kid | null {
  const match = STUDENT_REF.exec(ref.trim());
  if (!match) return null;
  const index = Number(match[1]) - 1;
  if (index < 0 || index >= kidsEnrolled.length) return null;
  return kidsEnrolled[index];
}

// Mención lista para renderizar en el modal. `idx` es la clave estable que el
// PATCH /confirm referencia en su delta (el cliente nunca manda student_id que
// el server inserte a ciegas — ver Tarea 9). `snippet`/`student_name` van con
// nombres reales (unredactados).
export type ConfirmMention = {
  idx: number;
  student_id: string;
  student_name: string;
  snippet: string;
  sentiment: MentionRow["sentiment"];
  confidence: MentionRow["ai_confidence"];
};

export type ConfirmAmbiguous = {
  idx: number;
  description: string;
  candidates: { student_id: string; student_name: string }[];
};

export type ConfirmationPayload = {
  mentions: ConfirmMention[];
  ambiguous: ConfirmAmbiguous[];
  general_notes: string;
};

// Builder PURO (unit-testeable sin DB ni APIs pagas). Reusa
// mapMentionsToStudents para las menciones (mismo mapeo por índice + unredact
// del snippet) y resuelve los candidatos ambiguos por token. Descripción y
// general_notes se unredactan porque pueden contener tokens [STUDENT_N].
export function buildConfirmationPayload(
  extract: ExtractMentionsResult,
  kidsEnrolled: Kid[],
  mappings: RedactionMappings
): ConfirmationPayload {
  const { rows } = mapMentionsToStudents(extract, kidsEnrolled, mappings);
  const nameById = new Map(kidsEnrolled.map((k) => [k.id, k.fullName]));

  const mentions: ConfirmMention[] = rows.map((r, idx) => ({
    idx,
    student_id: r.student_id,
    student_name: nameById.get(r.student_id) ?? "",
    snippet: r.content_snippet,
    sentiment: r.sentiment,
    confidence: r.ai_confidence,
  }));

  const ambiguous: ConfirmAmbiguous[] = (extract.ambiguous ?? []).map(
    (a, idx) => ({
      idx,
      description: unredactPII(a.description, mappings),
      candidates: (a.candidate_student_refs ?? [])
        .map((ref) => resolveStudentRef(ref, kidsEnrolled))
        .filter((k): k is Kid => k !== null)
        .map((k) => ({ student_id: k.id, student_name: k.fullName })),
    })
  );

  return {
    mentions,
    ambiguous,
    general_notes: unredactPII(extract.general_notes ?? "", mappings),
  };
}
