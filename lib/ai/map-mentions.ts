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
