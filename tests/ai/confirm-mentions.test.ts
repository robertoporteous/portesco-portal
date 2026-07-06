import { describe, it, expect } from "vitest";

import {
  buildConfirmedRows,
  ConfirmValidationError,
  type ConfirmDelta,
} from "@/lib/ai/confirm-mentions";
import type { ConfirmationPayload } from "@/lib/ai/map-mentions";

const RESOLVED: ConfirmationPayload = {
  mentions: [
    {
      idx: 0,
      student_id: "k1",
      student_name: "Carlos García",
      snippet: "Carlos García brilló en pases.",
      sentiment: "positive",
      confidence: "high",
    },
    {
      idx: 1,
      student_id: "k2",
      student_name: "Sebastián Pérez",
      snippet: "Sebastián Pérez flojo hoy.",
      sentiment: "concern",
      confidence: "medium",
    },
  ],
  ambiguous: [
    {
      idx: 0,
      description: "el defensa central trabajó bien",
      candidates: [{ student_id: "k3", student_name: "Ana Mendoza" }],
    },
  ],
  general_notes: "",
};

const ROSTER = new Set(["k1", "k2", "k3"]);
const empty: ConfirmDelta = { mentions: [], ambiguous: [] };

describe("buildConfirmedRows — Confirmar (default keep)", () => {
  it("keeps all detected mentions unchanged, drops unassigned ambiguous", () => {
    const rows = buildConfirmedRows(RESOLVED, empty, ROSTER);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      student_id: "k1",
      content_snippet: "Carlos García brilló en pases.",
      sentiment: "positive",
      ai_confidence: "high",
      professor_corrected: false,
    });
    expect(rows.every((r) => r.professor_corrected === false)).toBe(true);
  });
});

describe("buildConfirmedRows — Corregir (discard / reassign / sentiment)", () => {
  it("discards a mention", () => {
    const delta: ConfirmDelta = {
      mentions: [{ idx: 1, action: "discard" }],
      ambiguous: [],
    };
    const rows = buildConfirmedRows(RESOLVED, delta, ROSTER);
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe("k1");
  });

  it("reassigns a mention to another roster kid and flags professor_corrected", () => {
    const delta: ConfirmDelta = {
      mentions: [{ idx: 0, action: "edit", student_id: "k3" }],
      ambiguous: [],
    };
    const rows = buildConfirmedRows(RESOLVED, delta, ROSTER);
    expect(rows[0].student_id).toBe("k3");
    expect(rows[0].professor_corrected).toBe(true);
    // Snippet is the original quote (no free-text edit — D3 v2).
    expect(rows[0].content_snippet).toBe("Carlos García brilló en pases.");
  });

  it("changes sentiment via edit", () => {
    const delta: ConfirmDelta = {
      mentions: [{ idx: 0, action: "edit", sentiment: "neutral" }],
      ambiguous: [],
    };
    const rows = buildConfirmedRows(RESOLVED, delta, ROSTER);
    expect(rows[0].sentiment).toBe("neutral");
    expect(rows[0].student_id).toBe("k1");
    expect(rows[0].professor_corrected).toBe(true);
  });
});

describe("buildConfirmedRows — ambiguous assignment", () => {
  it("assigns an ambiguous mention to a roster kid (low confidence, corrected)", () => {
    const delta: ConfirmDelta = {
      mentions: [],
      ambiguous: [{ idx: 0, student_id: "k3" }],
    };
    const rows = buildConfirmedRows(RESOLVED, delta, ROSTER);
    expect(rows).toHaveLength(3); // 2 kept + 1 assigned
    const assigned = rows.find((r) => r.student_id === "k3");
    expect(assigned).toEqual({
      student_id: "k3",
      content_snippet: "el defensa central trabajó bien",
      sentiment: "neutral",
      ai_confidence: "low",
      professor_corrected: true,
    });
  });

  it("discards an ambiguous mention when student_id is null", () => {
    const delta: ConfirmDelta = {
      mentions: [],
      ambiguous: [{ idx: 0, student_id: null }],
    };
    const rows = buildConfirmedRows(RESOLVED, delta, ROSTER);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.student_id === "k3")).toBe(false);
  });
});

describe("buildConfirmedRows — guardrail: never trust client ids", () => {
  it("rejects reassigning a mention to a non-roster student_id", () => {
    const delta: ConfirmDelta = {
      mentions: [{ idx: 0, action: "edit", student_id: "intruder" }],
      ambiguous: [],
    };
    expect(() => buildConfirmedRows(RESOLVED, delta, ROSTER)).toThrow(
      ConfirmValidationError
    );
  });

  it("rejects assigning an ambiguous mention to a non-roster student_id", () => {
    const delta: ConfirmDelta = {
      mentions: [],
      ambiguous: [{ idx: 0, student_id: "intruder" }],
    };
    expect(() => buildConfirmedRows(RESOLVED, delta, ROSTER)).toThrow(
      ConfirmValidationError
    );
  });

  it("rejects a decision referencing an idx outside the payload", () => {
    const delta: ConfirmDelta = {
      mentions: [{ idx: 9, action: "discard" }],
      ambiguous: [],
    };
    expect(() => buildConfirmedRows(RESOLVED, delta, ROSTER)).toThrow(
      ConfirmValidationError
    );
  });
});
