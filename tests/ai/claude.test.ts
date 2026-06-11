import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

import {
  extractText,
  buildClaudeAuditRow,
  buildClaudeFailureAuditRow,
} from "@/lib/ai/claude";
import {
  buildExtractionUserPrompt,
  EXTRACT_MENTIONS_SCHEMA,
} from "@/lib/ai/prompts/extract-mentions-v1";
import { redactPII, type Kid } from "@/lib/ai/redact";

const KIDS: Kid[] = [
  { id: "k1", fullName: "Carlos García" },
  { id: "k2", fullName: "Sebastián Pérez" },
  { id: "k3", fullName: "Ana Mendoza" },
];

describe("extractText", () => {
  it("joins text blocks and ignores thinking/tool blocks", () => {
    const content = [
      { type: "thinking", thinking: "razonando…" },
      { type: "text", text: "parte 1 " },
      { type: "text", text: "parte 2" },
    ] as unknown as Anthropic.ContentBlock[];
    expect(extractText(content)).toBe("parte 1 parte 2");
  });

  it("returns empty string when there are no text blocks", () => {
    const content = [
      { type: "thinking", thinking: "x" },
    ] as unknown as Anthropic.ContentBlock[];
    expect(extractText(content)).toBe("");
  });
});

describe("buildExtractionUserPrompt", () => {
  it("lists the FULL roster (so redactPII assigns a placeholder to every kid)", () => {
    const prompt = buildExtractionUserPrompt(KIDS, "transcripción de prueba");
    expect(prompt).toContain("Carlos García");
    expect(prompt).toContain("Sebastián Pérez");
    expect(prompt).toContain("Ana Mendoza");
    expect(prompt).toContain("transcripción de prueba");
  });

  it("after redaction, every enrolled kid gets a placeholder by index", () => {
    const prompt = buildExtractionUserPrompt(KIDS, "[transcript]");
    const { redactedText, mappings } = redactPII(prompt, { kidsEnrolled: KIDS });
    // Las 3 del roster quedan redactadas aunque no aparezcan en el transcript.
    expect(redactedText).toContain("[STUDENT_1]");
    expect(redactedText).toContain("[STUDENT_2]");
    expect(redactedText).toContain("[STUDENT_3]");
    expect(redactedText).not.toContain("Carlos García");
    expect(mappings["[STUDENT_1]"]).toBe("Carlos García");
    expect(mappings["[STUDENT_3]"]).toBe("Ana Mendoza");
  });
});

describe("buildClaudeAuditRow — nunca PII cruda en logs (§3.4)", () => {
  // Fixture: prompt redactado + salida de Claude (que viene con placeholders
  // porque el input estaba redactado). Simula una corrida real de extracción.
  const rawTranscript = "[STUDENT_1] jugó muy bien. [STUDENT_2] llegó tarde.";
  const userPrompt = buildExtractionUserPrompt(KIDS, "Carlos García jugó muy bien. Sebastián Pérez llegó tarde.");
  const { redactedText, mappings } = redactPII(userPrompt, { kidsEnrolled: KIDS });
  const claudeOutput = JSON.stringify({
    mentions: [
      { student_ref: "[STUDENT_1]", sentiment: "positive", content_snippet: rawTranscript, confidence: "high" },
      { student_ref: "[STUDENT_2]", sentiment: "concern", content_snippet: "[STUDENT_2] llegó tarde.", confidence: "high" },
    ],
    ambiguous: [],
    general_notes: "",
  });

  const row = buildClaudeAuditRow({
    feature: "voice_extraction",
    userId: "prof-1",
    redactedPrompt: redactedText,
    rawClaudeOutput: claudeOutput,
    mappings,
    modelVersion: "claude-sonnet-4-6",
    inputTokens: 320,
    outputTokens: 140,
    latencyMs: 5200,
    stopReason: "end_turn",
    responseFormat: "json",
    relatedObservationId: "obs-9",
  });

  it("input_raw is null; input_redacted has no real names", () => {
    expect(row.input_raw).toBeNull();
    expect(row.input_redacted).not.toContain("Carlos García");
    expect(row.input_redacted).not.toContain("Sebastián Pérez");
    expect(row.input_redacted).toContain("[STUDENT_1]");
  });

  it("ai_output carries placeholders, never real names", () => {
    expect(row.ai_output).not.toContain("Carlos García");
    expect(row.ai_output).not.toContain("Sebastián Pérez");
    expect(row.ai_output).toContain("[STUDENT_1]");
  });

  it("tags the row for compliance review (§3.3)", () => {
    expect(row.feature).toBe("voice_extraction");
    expect(row.data_classification).toBe("pii");
    expect(row.model_name).toBe("claude-sonnet-4-6");
    expect(row.related_observation_id).toBe("obs-9");
    expect(row.metadata.redaction_placeholders).toBe(3);
    expect(row.metadata.thinking).toBe("adaptive");
  });
});

describe("EXTRACT_MENTIONS_SCHEMA — válido para structured outputs", () => {
  it("todos los objetos tienen additionalProperties:false", () => {
    expect(EXTRACT_MENTIONS_SCHEMA.additionalProperties).toBe(false);
    expect(EXTRACT_MENTIONS_SCHEMA.properties.mentions.items.additionalProperties).toBe(false);
    expect(EXTRACT_MENTIONS_SCHEMA.properties.ambiguous.items.additionalProperties).toBe(false);
  });

  it("sentiment y confidence usan los enums del schema DB", () => {
    expect(EXTRACT_MENTIONS_SCHEMA.properties.mentions.items.properties.sentiment.enum).toEqual([
      "positive",
      "neutral",
      "concern",
      "negative",
    ]);
    expect(EXTRACT_MENTIONS_SCHEMA.properties.mentions.items.properties.confidence.enum).toEqual([
      "high",
      "medium",
      "low",
    ]);
  });
});

describe("buildClaudeFailureAuditRow — audita el intento fallido (§3.3)", () => {
  const { redactedText, mappings } = redactPII(
    buildExtractionUserPrompt(KIDS, "Carlos García jugó bien."),
    { kidsEnrolled: KIDS }
  );
  const row = buildClaudeFailureAuditRow({
    feature: "voice_extraction",
    userId: "prof-1",
    redactedPrompt: redactedText,
    mappings,
    latencyMs: 800,
    error: "overloaded_error",
    responseFormat: "json",
    relatedObservationId: "obs-9",
  });

  it("records the attempt: no output, redacted prompt, error in metadata", () => {
    expect(row.feature).toBe("voice_extraction");
    expect(row.ai_output).toBeNull();
    expect(row.input_raw).toBeNull();
    expect(row.input_redacted).not.toContain("Carlos García");
    expect(row.input_redacted).toContain("[STUDENT_1]");
    expect(row.metadata.failed).toBe(true);
    expect(row.metadata.error).toBe("overloaded_error");
    expect(row.related_observation_id).toBe("obs-9");
    expect(JSON.stringify(row.metadata)).not.toContain("Carlos");
  });
});
