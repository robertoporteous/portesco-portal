// lib/ai/claude.ts — helper CENTRALIZADO de toda call de TEXTO a Claude.
//
// AGENTS.md §3.3 (NO NEGOCIABLE): toda call a Claude escribe un row en
// audit_logs. §3.4: TODA call de texto a un LLM se redacta sin excepción
// (el carve-out de Whisper NO aplica acá). Si algún code path llama al SDK de
// Anthropic directo sin pasar por callClaude(), rebote en review.
//
// Flujo (Architecture §4.1):
//   1. redactPII(userPrompt, contextDataForRedaction) → placeholders
//   2. Anthropic SDK (Sonnet 4.6) con system + user REDACTADOS
//   3. responseFormat 'text' → unredactPII(output); 'json' → JSON.parse (los
//      placeholders se MANTIENEN para que el caller mapee a student_id)
//   4. INSERT audit_logs (input_raw=null, input_redacted, ai_output con
//      placeholders → nunca PII cruda en logs), model, tokens, latency
//   5. return output + telemetría + redactionMappings
import Anthropic from "@anthropic-ai/sdk";

import {
  redactPII,
  unredactPII,
  type Kid,
  type RedactionMappings,
} from "@/lib/ai/redact";
import { createServiceClient } from "@/lib/supabase/service";

// Sonnet 4.6 — precisión de nombres panameños + spanglish > Haiku
// (Architecture §11 Q#8). model id exacto, sin sufijo de fecha.
const CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 8192;

export type ClaudeFeature =
  | "voice_extraction"
  | "bi_weekly_report"
  | "other";

export type ClaudeCallArgs = {
  feature: ClaudeFeature;
  systemPrompt: string;
  /** Prompt con NOMBRES REALES — se redacta entero acá adentro. */
  userPrompt: string;
  /** Niños de la sesión: define el mapping placeholder↔nombre de redactPII. */
  contextDataForRedaction: { kidsEnrolled: Kid[] };
  userId: string;
  relatedObservationId?: string;
  relatedReportId?: string;
  responseFormat?: "text" | "json";
  /** JSON Schema para structured outputs (solo con responseFormat='json'). */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  dataClassification?: "pii" | "sensitive" | "general";
};

export type ClaudeCallResult<T = string> = {
  output: T;
  modelName: string;
  modelVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  stopReason: string | null;
  redactionMappings: RedactionMappings;
};

// ---------------------------------------------------------------------------
// Lógica pura (testeable sin llamar a Anthropic — suite gratis con fixtures).
// ---------------------------------------------------------------------------

/** Concatena los bloques de texto de la respuesta (ignora thinking/tool). */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export type ClaudeAuditRow = {
  user_id: string;
  feature: ClaudeFeature;
  input_raw: null;
  input_redacted: string;
  ai_output: string; // salida de Claude con placeholders — sin PII cruda
  data_classification: "pii" | "sensitive" | "general";
  model_name: string;
  model_version: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  ai_confidence: null;
  related_observation_id: string | null;
  related_report_id: string | null;
  metadata: {
    response_format: "text" | "json";
    stop_reason: string | null;
    redaction_placeholders: number;
    thinking: "adaptive";
  };
};

/**
 * Arma el row de audit_logs. Loggea SOLO la versión redactada del prompt y la
 * salida cruda de Claude (que ya viene con placeholders porque el input estaba
 * redactado) — nunca nombres reales (§3.4). input_raw siempre null.
 */
export function buildClaudeAuditRow(input: {
  feature: ClaudeFeature;
  userId: string;
  redactedPrompt: string;
  rawClaudeOutput: string;
  mappings: RedactionMappings;
  modelVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  stopReason: string | null;
  responseFormat: "text" | "json";
  relatedObservationId?: string;
  relatedReportId?: string;
  dataClassification?: "pii" | "sensitive" | "general";
}): ClaudeAuditRow {
  return {
    user_id: input.userId,
    feature: input.feature,
    input_raw: null,
    input_redacted: input.redactedPrompt,
    ai_output: input.rawClaudeOutput,
    data_classification: input.dataClassification ?? "pii",
    model_name: CLAUDE_MODEL,
    model_version: input.modelVersion,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    latency_ms: input.latencyMs,
    ai_confidence: null,
    related_observation_id: input.relatedObservationId ?? null,
    related_report_id: input.relatedReportId ?? null,
    metadata: {
      response_format: input.responseFormat,
      stop_reason: input.stopReason,
      redaction_placeholders: Object.keys(input.mappings).length,
      thinking: "adaptive",
    },
  };
}

// ---------------------------------------------------------------------------
// Side-effecting: redact → Anthropic → unredact/parse → audit INSERT.
// ---------------------------------------------------------------------------

export async function callClaude<T = string>(
  args: ClaudeCallArgs
): Promise<ClaudeCallResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("callClaude: missing ANTHROPIC_API_KEY");

  const responseFormat = args.responseFormat ?? "text";

  // 1) Redactar el user prompt (system es estático, sin PII).
  const { redactedText, mappings } = redactPII(
    args.userPrompt,
    args.contextDataForRedaction
  );

  // 2) Anthropic SDK — Sonnet 4.6, adaptive thinking. structured outputs si hay
  //    schema (garantiza JSON válido sin prefill).
  const client = new Anthropic({ apiKey });
  const startedAt = Date.now();
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
    thinking: { type: "adaptive" },
    system: args.systemPrompt,
    messages: [{ role: "user", content: redactedText }],
    ...(responseFormat === "json" && args.jsonSchema
      ? {
          output_config: {
            format: { type: "json_schema" as const, schema: args.jsonSchema },
          },
        }
      : {}),
  });
  const latencyMs = Date.now() - startedAt;

  if (res.stop_reason === "refusal") {
    throw new Error(`callClaude: model refused (feature=${args.feature})`);
  }

  const rawOutput = extractText(res.content);

  // 3) audit_logs (redactado). service_role bypassa la RLS de audit_logs.
  const supabase = createServiceClient();
  const auditRow = buildClaudeAuditRow({
    feature: args.feature,
    userId: args.userId,
    redactedPrompt: redactedText,
    rawClaudeOutput: rawOutput,
    mappings,
    modelVersion: res.model ?? null,
    inputTokens: res.usage?.input_tokens ?? null,
    outputTokens: res.usage?.output_tokens ?? null,
    latencyMs,
    stopReason: res.stop_reason ?? null,
    responseFormat,
    relatedObservationId: args.relatedObservationId,
    relatedReportId: args.relatedReportId,
    dataClassification: args.dataClassification,
  });
  const { error: auditError } = await supabase
    .from("audit_logs")
    .insert(auditRow);
  if (auditError) {
    // §3.3: sin audit no devolvemos output.
    throw new Error(`callClaude: audit_logs insert failed: ${auditError.message}`);
  }

  // 4) Resolver el output devuelto al caller.
  //    'json' → parse con placeholders intactos (el caller mapea a student_id).
  //    'text' → unredact (restaura nombres reales para tablas con RLS).
  const output =
    responseFormat === "json"
      ? (JSON.parse(rawOutput) as T)
      : (unredactPII(rawOutput, mappings) as unknown as T);

  return {
    output,
    modelName: CLAUDE_MODEL,
    modelVersion: res.model ?? CLAUDE_MODEL,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    latencyMs,
    stopReason: res.stop_reason ?? null,
    redactionMappings: mappings,
  };
}
