// lib/ai/confirm-mentions.ts — lógica PURA del confirm (Tarea 9, flujo A).
//
// El PATCH /api/observations/{id}/confirm recibe un DELTA del profesor sobre la
// vista resuelta que se persistió en class_observations.extraction_json (Tarea
// 8.1). Acá lo aplicamos y producimos las filas finales de mention_assignments.
//
// GUARDRAIL: el cliente NUNCA manda un student_id que insertemos a ciegas
// (AGENTS §4). Toda reasignación / asignación de ambigua se valida contra el
// roster REAL de la sesión (rosterIds), derivado server-side. Un idx fuera de
// rango o un student_id fuera del roster es un bug/tampering → error 400.
//
// Alcance de "Corregir" (D3, aprobado): descartar, reasignar a otro kid del
// roster, asignar/descartar ambigua, cambiar sentiment. Editar texto libre del
// snippet queda para v2 — el snippet ya es cita fiel.
import type { ConfirmationPayload } from "@/lib/ai/map-mentions";

export type MentionSentiment = "positive" | "neutral" | "concern" | "negative";
export type AiConfidence = "high" | "medium" | "low";

// Decisión del profesor sobre una mención detectada (por idx del payload).
export type ConfirmMentionDecision = {
  idx: number;
  action: "keep" | "edit" | "discard";
  /** edit: reasignar a otro kid del roster. */
  student_id?: string;
  /** edit: cambiar el sentiment. */
  sentiment?: MentionSentiment;
};

// Decisión sobre una mención ambigua (por idx). student_id null = descartar.
export type ConfirmAmbiguousDecision = {
  idx: number;
  student_id: string | null;
  sentiment?: MentionSentiment;
};

export type ConfirmDelta = {
  mentions: ConfirmMentionDecision[];
  ambiguous: ConfirmAmbiguousDecision[];
};

// Fila lista para INSERT en mention_assignments (el caller le agrega
// observation_id). El INSERT dispara el trigger que puebla profile_observations.
export type ConfirmedRow = {
  student_id: string;
  content_snippet: string;
  sentiment: MentionSentiment;
  ai_confidence: AiConfidence;
  professor_corrected: boolean;
};

export class ConfirmValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmValidationError";
  }
}

// Ambigua asignada: no viene con sentiment/confidence de Claude (era ambigua),
// así que default neutral + low. El profesor puede sobreescribir el sentiment.
const AMBIGUOUS_DEFAULT_SENTIMENT: MentionSentiment = "neutral";
const AMBIGUOUS_CONFIDENCE: AiConfidence = "low";

/**
 * Aplica el delta del profesor sobre la vista resuelta y devuelve las filas
 * confirmadas. PURO (sin DB, sin APIs) → unit-testeable.
 *
 * Defaults seguros: una mención sin decisión explícita se MANTIENE (Confirmar =
 * aceptar lo detectado); una ambigua sin decisión (o con student_id null) se
 * DESCARTA (no contamina el perfil). professor_corrected = true solo en las
 * editadas/reasignadas y en las ambiguas asignadas por humano.
 */
export function buildConfirmedRows(
  resolved: ConfirmationPayload,
  delta: ConfirmDelta,
  rosterIds: Set<string>
): ConfirmedRow[] {
  const mentionDecisions = new Map(
    (delta.mentions ?? []).map((d) => [d.idx, d])
  );
  const ambiguousDecisions = new Map(
    (delta.ambiguous ?? []).map((d) => [d.idx, d])
  );

  // Todo idx del delta debe existir en el payload (defensa anti-tampering).
  for (const idx of mentionDecisions.keys()) {
    if (!resolved.mentions.some((m) => m.idx === idx)) {
      throw new ConfirmValidationError(`mention idx ${idx} not in payload`);
    }
  }
  for (const idx of ambiguousDecisions.keys()) {
    if (!resolved.ambiguous.some((a) => a.idx === idx)) {
      throw new ConfirmValidationError(`ambiguous idx ${idx} not in payload`);
    }
  }

  const rows: ConfirmedRow[] = [];

  // 1) Menciones detectadas.
  for (const m of resolved.mentions) {
    const d = mentionDecisions.get(m.idx);
    const action = d?.action ?? "keep";
    if (action === "discard") continue;

    if (action === "edit") {
      const studentId = d?.student_id ?? m.student_id;
      if (!rosterIds.has(studentId)) {
        throw new ConfirmValidationError(
          `student_id ${studentId} not in session roster`
        );
      }
      rows.push({
        student_id: studentId,
        content_snippet: m.snippet,
        sentiment: d?.sentiment ?? m.sentiment,
        ai_confidence: m.confidence,
        professor_corrected: true,
      });
      continue;
    }

    // keep — la mención tal cual la extrajo la AI.
    rows.push({
      student_id: m.student_id,
      content_snippet: m.snippet,
      sentiment: m.sentiment,
      ai_confidence: m.confidence,
      professor_corrected: false,
    });
  }

  // 2) Ambiguas: solo entran las que el profesor asignó a un kid del roster.
  for (const a of resolved.ambiguous) {
    const d = ambiguousDecisions.get(a.idx);
    if (!d || d.student_id == null) continue; // sin asignar → descartada
    if (!rosterIds.has(d.student_id)) {
      throw new ConfirmValidationError(
        `ambiguous student_id ${d.student_id} not in session roster`
      );
    }
    rows.push({
      student_id: d.student_id,
      content_snippet: a.description,
      sentiment: d.sentiment ?? AMBIGUOUS_DEFAULT_SENTIMENT,
      ai_confidence: AMBIGUOUS_CONFIDENCE,
      professor_corrected: true,
    });
  }

  return rows;
}
