import { describe, it, expect } from "vitest";

import { mapMentionsToStudents } from "@/lib/ai/map-mentions";
import { redactPII, type Kid } from "@/lib/ai/redact";
import {
  buildExtractionUserPrompt,
  type ExtractMentionsResult,
} from "@/lib/ai/prompts/extract-mentions-v1";

// Roster order: Carlos(k1), Sebastián(k2), Ana(k3).
const KIDS: Kid[] = [
  { id: "k1", fullName: "Carlos García" },
  { id: "k2", fullName: "Sebastián Pérez" },
  { id: "k3", fullName: "Ana Mendoza" },
];

describe("redactPII — numbering is by kidsEnrolled INDEX, not appearance", () => {
  it("a kid mentioned first still gets the placeholder of its roster index", () => {
    // Ana (roster index 3) appears BEFORE Carlos (roster index 1) in the text.
    const text = "Ana Mendoza brilló y después Carlos García falló un penal.";
    const { redactedText, mappings } = redactPII(text, { kidsEnrolled: KIDS });
    // If numbering were by appearance, Ana would be [STUDENT_1]. It must be
    // [STUDENT_3] — tied to her index in kidsEnrolled.
    expect(redactedText).toBe("[STUDENT_3] brilló y después [STUDENT_1] falló un penal.");
    expect(mappings["[STUDENT_3]"]).toBe("Ana Mendoza");
    expect(mappings["[STUDENT_1]"]).toBe("Carlos García");
  });
});

describe("mapMentionsToStudents — guardrail #1 (mention order ≠ roster order)", () => {
  // Realistic mappings: redact the full prompt (roster + transcript), same as
  // the pipeline does, so every enrolled kid has a placeholder by index.
  const transcript = "Ana Mendoza brilló. Carlos García flojo hoy.";
  const prompt = buildExtractionUserPrompt(KIDS, transcript);
  const { mappings } = redactPII(prompt, { kidsEnrolled: KIDS });

  // Claude output (placeholders), mentions in a DIFFERENT order than the roster:
  // Ana ([STUDENT_3]) first, then Carlos ([STUDENT_1]).
  const extract: ExtractMentionsResult = {
    mentions: [
      {
        student_ref: "[STUDENT_3]",
        sentiment: "positive",
        content_snippet: "[STUDENT_3] brilló.",
        confidence: "high",
      },
      {
        student_ref: "[STUDENT_1]",
        sentiment: "concern",
        content_snippet: "[STUDENT_1] flojo hoy.",
        confidence: "medium",
      },
    ],
    ambiguous: [],
    general_notes: "",
  };

  it("maps each placeholder to the correct student_id by index", () => {
    const { rows, skipped } = mapMentionsToStudents(extract, KIDS, mappings);
    expect(skipped).toHaveLength(0);
    expect(rows).toHaveLength(2);
    // [STUDENT_3] → Ana (k3), [STUDENT_1] → Carlos (k1) — order-independent.
    expect(rows[0].student_id).toBe("k3");
    expect(rows[1].student_id).toBe("k1");
  });

  it("unredacts content_snippet to real names (RLS table, not a log)", () => {
    const { rows } = mapMentionsToStudents(extract, KIDS, mappings);
    expect(rows[0].content_snippet).toBe("Ana Mendoza brilló.");
    expect(rows[1].content_snippet).toBe("Carlos García flojo hoy.");
    expect(rows[0].content_snippet).not.toContain("[STUDENT_");
  });

  it("carries sentiment + confidence through", () => {
    const { rows } = mapMentionsToStudents(extract, KIDS, mappings);
    expect(rows[0].sentiment).toBe("positive");
    expect(rows[0].ai_confidence).toBe("high");
    expect(rows[1].sentiment).toBe("concern");
    expect(rows[1].ai_confidence).toBe("medium");
  });
});

describe("mapMentionsToStudents — defensive skips (no bad rows reach the DB)", () => {
  const extract: ExtractMentionsResult = {
    mentions: [
      { student_ref: "el defensa", sentiment: "neutral", content_snippet: "x", confidence: "low" },
      { student_ref: "[STUDENT_9]", sentiment: "neutral", content_snippet: "y", confidence: "low" },
      { student_ref: "[STUDENT_2]", sentiment: "neutral", content_snippet: "z", confidence: "low" },
    ],
    ambiguous: [],
    general_notes: "",
  };

  it("skips bad tokens and out-of-range indices, keeps valid ones", () => {
    const { rows, skipped } = mapMentionsToStudents(extract, KIDS, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe("k2");
    expect(skipped).toEqual([
      { student_ref: "el defensa", reason: "bad_token" },
      { student_ref: "[STUDENT_9]", reason: "index_out_of_range" },
    ]);
  });
});
