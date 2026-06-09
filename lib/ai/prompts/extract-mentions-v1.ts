// lib/ai/prompts/extract-mentions-v1.ts
//
// Prompt v1 para extracción de menciones individuales de un voice note grupal.
// Versionado en CÓDIGO (git diff = historial), NO en DB (Architecture §4.1).
//
// CONTRATO DE REDACCIÓN (correctness crítico):
//   callClaude() corre redactPII() sobre TODO el user prompt antes de mandarlo a
//   Claude. El user prompt incluye el roster + el transcript, ambos con nombres
//   reales → redactPII los reemplaza por placeholders [STUDENT_1], [STUDENT_2]…
//   en el ORDEN de kidsEnrolled. Por eso Claude NUNCA ve nombres ni student_id
//   reales: referencia a cada niño por su placeholder token. El caller (Tarea 7)
//   mapea placeholder → student_id por índice. Esto mantiene PII e identificadores
//   de menores fuera del LLM de texto (AGENTS §3.4, sin carve-out para Claude).

export const EXTRACT_MENTIONS_SYSTEM = `Eres un asistente que analiza la transcripción de un voice note grupal grabado por un profesor de deportes después de una clase. Tu tarea es extraer las menciones individuales de cada estudiante.

Recibís dos cosas en el mensaje:
1. Un ROSTER: la lista de estudiantes de la sesión, cada uno identificado por un token de la forma [STUDENT_N] (ej. [STUDENT_1], [STUDENT_2]). Esos tokens YA reemplazan los nombres reales.
2. La TRANSCRIPCIÓN del voice note, donde los nombres también aparecen como esos mismos tokens.

REGLAS (estrictas):
- NO inventes. Si el profesor no dijo nada de un estudiante, NO generes una mención para él.
- Solo podés asignar menciones a tokens que estén en el ROSTER. Nunca inventes un token nuevo.
- Si una mención es ambigua (no estás seguro de a qué estudiante se refiere), marcala con confidence "low".
- Si el profesor describe a un estudiante SIN usar su token ("el defensa central trabajó bien", "el chico nuevo"), NO adivines: ponelo en "ambiguous" con los tokens candidatos posibles del roster.
- "content_snippet" debe ser una cita corta y fiel de lo que el profesor dijo sobre ese estudiante (en español, conservando los tokens [STUDENT_N] tal cual aparecen).
- "general_notes": comentarios del profesor que aplican al grupo entero, no a un estudiante específico. String vacío si no hay.
- sentiment ∈ positive | neutral | concern | negative. confidence ∈ high | medium | low.

Devolvé exclusivamente el objeto JSON con el shape especificado. Sin texto adicional, sin markdown.`;

// JSON Schema para structured outputs (output_config.format). Cumple las
// limitaciones de Anthropic structured outputs: additionalProperties:false en
// todos los objetos, enums permitidos, sin min/maxLength.
export const EXTRACT_MENTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mentions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          student_ref: {
            type: "string",
            description: "Token del roster, ej. [STUDENT_1]",
          },
          sentiment: {
            type: "string",
            enum: ["positive", "neutral", "concern", "negative"],
          },
          content_snippet: {
            type: "string",
            description: "Cita corta y fiel, conservando los tokens [STUDENT_N]",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
        },
        required: ["student_ref", "sentiment", "content_snippet", "confidence"],
      },
    },
    ambiguous: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          candidate_student_refs: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["description", "candidate_student_refs"],
      },
    },
    general_notes: { type: "string" },
  },
  required: ["mentions", "ambiguous", "general_notes"],
} as const;

// Tipo del JSON que devuelve Claude (placeholders, pre-mapeo a student_id).
export type ExtractMentionsResult = {
  mentions: {
    student_ref: string;
    sentiment: "positive" | "neutral" | "concern" | "negative";
    content_snippet: string;
    confidence: "high" | "medium" | "low";
  }[];
  ambiguous: {
    description: string;
    candidate_student_refs: string[];
  }[];
  general_notes: string;
};

/**
 * Arma el user prompt de extracción con NOMBRES REALES (roster + transcript).
 * callClaude() lo redacta entero antes de mandarlo a Claude, así que el roster
 * y el transcript quedan con los MISMOS placeholders por índice. Listar todo el
 * roster garantiza que redactPII asigne un placeholder a cada niño enrolled —
 * incluso a los no mencionados — para que el mapeo placeholder→id de la Tarea 7
 * sea total.
 */
export function buildExtractionUserPrompt(
  kidsEnrolled: { fullName: string }[],
  rawTranscript: string
): string {
  const roster = kidsEnrolled
    .map((k) => `- ${k.fullName.trim()}`)
    .join("\n");
  return `ROSTER (estudiantes de la sesión):
${roster}

TRANSCRIPCIÓN:
${rawTranscript}`;
}
