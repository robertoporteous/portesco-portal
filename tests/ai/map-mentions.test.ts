import { describe, it, expect } from "vitest";

import {
  mapMentionsToStudents,
  buildConfirmationPayload,
  resolveStudentRef,
} from "@/lib/ai/map-mentions";
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

describe("resolveStudentRef — token → kid by roster index", () => {
  it("resolves a valid token, rejects bad tokens and out-of-range indices", () => {
    expect(resolveStudentRef("[STUDENT_2]", KIDS)).toEqual(KIDS[1]);
    expect(resolveStudentRef(" [STUDENT_1] ", KIDS)).toEqual(KIDS[0]);
    expect(resolveStudentRef("el defensa", KIDS)).toBeNull();
    expect(resolveStudentRef("[STUDENT_9]", KIDS)).toBeNull();
  });
});

describe("buildConfirmationPayload — resolved view for the confirmation modal (8.1)", () => {
  const transcript =
    "Ana Mendoza brilló. Carlos García flojo hoy. Buen ambiente de grupo.";
  const prompt = buildExtractionUserPrompt(KIDS, transcript);
  const { mappings } = redactPII(prompt, { kidsEnrolled: KIDS });

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
    ambiguous: [
      {
        description: "el defensa central trabajó bien",
        // Mix of valid + out-of-range + bad token: only the valid one survives.
        candidate_student_refs: ["[STUDENT_2]", "[STUDENT_9]", "el chico nuevo"],
      },
    ],
    general_notes: "Buen ambiente; felicité a [STUDENT_3].",
  };

  it("resolves mentions to real names + student_id with a stable idx", () => {
    const p = buildConfirmationPayload(extract, KIDS, mappings);
    expect(p.mentions).toHaveLength(2);
    expect(p.mentions[0]).toMatchObject({
      idx: 0,
      student_id: "k3",
      student_name: "Ana Mendoza",
      snippet: "Ana Mendoza brilló.",
      sentiment: "positive",
      confidence: "high",
    });
    expect(p.mentions[1]).toMatchObject({
      idx: 1,
      student_id: "k1",
      student_name: "Carlos García",
      snippet: "Carlos García flojo hoy.",
    });
    // The human-facing view must never leak placeholders.
    expect(JSON.stringify(p.mentions)).not.toContain("[STUDENT_");
  });

  it("resolves ambiguous candidates, dropping invalid refs", () => {
    const p = buildConfirmationPayload(extract, KIDS, mappings);
    expect(p.ambiguous).toHaveLength(1);
    expect(p.ambiguous[0].idx).toBe(0);
    expect(p.ambiguous[0].description).toBe("el defensa central trabajó bien");
    expect(p.ambiguous[0].candidates).toEqual([
      { student_id: "k2", student_name: "Sebastián Pérez" },
    ]);
  });

  it("unredacts general_notes (may carry tokens)", () => {
    const p = buildConfirmationPayload(extract, KIDS, mappings);
    expect(p.general_notes).toBe("Buen ambiente; felicité a Ana Mendoza.");
    expect(p.general_notes).not.toContain("[STUDENT_");
  });
});
