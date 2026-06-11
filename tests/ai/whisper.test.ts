import { describe, it, expect } from "vitest";

import {
  buildContextHint,
  deriveConfidenceLabel,
  buildTranscriptionAuditRow,
  buildTranscriptionFailureAuditRow,
  parseStoragePath,
} from "@/lib/ai/whisper";
import type { Kid } from "@/lib/ai/redact";

// Fixture grabado del shape verbose_json de whisper-1 (NO mock de integración —
// es una respuesta real recortada, patrón aceptado para no quemar el cap de
// OpenAI; el pipeline real se prueba en test:e2e:voice, Tarea 12).
const WHISPER_FIXTURE = {
  text: "Carlos García jugó muy bien hoy, marcó dos goles. Sebastián Pérez estuvo distraído.",
  language: "spanish",
  duration: 182.4,
  segments: [
    { id: 0, avg_logprob: -0.18, text: "Carlos García jugó muy bien hoy," },
    { id: 1, avg_logprob: -0.22, text: "marcó dos goles." },
    { id: 2, avg_logprob: -0.25, text: "Sebastián Pérez estuvo distraído." },
  ],
};

const KIDS: Kid[] = [
  { id: "k1", fullName: "Carlos García" },
  { id: "k2", fullName: "Sebastián Pérez" },
  { id: "k3", fullName: "Ana Mendoza" },
];

describe("buildContextHint", () => {
  it("lists enrolled kid names for the Whisper prompt", () => {
    const hint = buildContextHint(KIDS);
    expect(hint).toContain("Carlos García");
    expect(hint).toContain("Sebastián Pérez");
    expect(hint).toContain("Ana Mendoza");
  });

  it("returns empty string when there are no kids", () => {
    expect(buildContextHint([])).toBe("");
  });
});

describe("deriveConfidenceLabel", () => {
  it("maps high avg_logprob (~-0.2) to 'high'", () => {
    expect(deriveConfidenceLabel(WHISPER_FIXTURE.segments)).toBe("high");
  });

  it("maps mid avg_logprob to 'medium'", () => {
    expect(deriveConfidenceLabel([{ avg_logprob: -0.5 }])).toBe("medium");
  });

  it("maps low avg_logprob to 'low'", () => {
    expect(deriveConfidenceLabel([{ avg_logprob: -0.9 }])).toBe("low");
  });

  it("returns null with no segments or no avg_logprob", () => {
    expect(deriveConfidenceLabel([])).toBeNull();
    expect(deriveConfidenceLabel(null)).toBeNull();
    expect(deriveConfidenceLabel([{}])).toBeNull();
  });
});

describe("parseStoragePath", () => {
  it("strips the bucket prefix and extracts the filename", () => {
    expect(parseStoragePath("voice-obs/abc-123/obs-9.m4a")).toEqual({
      objectPath: "abc-123/obs-9.m4a",
      fileName: "obs-9.m4a",
    });
  });

  it("accepts a path without the bucket prefix", () => {
    expect(parseStoragePath("abc-123/obs-9.webm")).toEqual({
      objectPath: "abc-123/obs-9.webm",
      fileName: "obs-9.webm",
    });
  });
});

describe("buildTranscriptionAuditRow — Opción 2 (transcript redactado)", () => {
  const row = buildTranscriptionAuditRow({
    userId: "prof-1",
    observationId: "obs-9",
    rawTranscript: WHISPER_FIXTURE.text,
    kidsEnrolled: KIDS,
    language: WHISPER_FIXTURE.language,
    durationSeconds: Math.round(WHISPER_FIXTURE.duration),
    latencyMs: 4200,
    confidence: deriveConfidenceLabel(WHISPER_FIXTURE.segments),
  });

  it("redacts real names out of ai_output (NEVER log raw PII, §3.4)", () => {
    expect(row.ai_output).not.toContain("Carlos García");
    expect(row.ai_output).not.toContain("Sebastián Pérez");
    expect(row.ai_output).toContain("[STUDENT_1]");
    expect(row.ai_output).toContain("[STUDENT_2]");
  });

  it("never stores raw transcript in input_raw / input_redacted", () => {
    expect(row.input_raw).toBeNull();
    expect(row.input_redacted).toBeNull();
  });

  it("metadata carries no raw names, only counts", () => {
    const metaJson = JSON.stringify(row.metadata);
    expect(metaJson).not.toContain("Carlos");
    expect(metaJson).not.toContain("Pérez");
    expect(row.metadata.redaction_placeholders).toBe(2); // 2 of 3 kids mentioned
    expect(row.metadata.kids_in_context).toBe(3);
    expect(row.metadata.duration_seconds).toBe(182);
  });

  it("tags the row for compliance review (§3.3)", () => {
    expect(row.feature).toBe("voice_transcription");
    expect(row.data_classification).toBe("pii");
    expect(row.model_name).toBe("whisper-1");
    expect(row.related_observation_id).toBe("obs-9");
    expect(row.ai_confidence).toBe("high");
  });
});

describe("buildTranscriptionFailureAuditRow — audita el intento fallido (§3.3)", () => {
  const row = buildTranscriptionFailureAuditRow({
    userId: "prof-1",
    observationId: "obs-9",
    kidsEnrolled: KIDS,
    latencyMs: 1200,
    error: "Request timed out",
  });

  it("records the attempt: no output, no PII, error in metadata", () => {
    expect(row.feature).toBe("voice_transcription");
    expect(row.ai_output).toBeNull();
    expect(row.input_raw).toBeNull();
    expect(row.input_redacted).toBeNull();
    expect(row.metadata.failed).toBe(true);
    expect(row.metadata.error).toBe("Request timed out");
    expect(row.metadata.kids_in_context).toBe(3);
    expect(row.related_observation_id).toBe("obs-9");
    expect(JSON.stringify(row)).not.toContain("Carlos");
  });
});
