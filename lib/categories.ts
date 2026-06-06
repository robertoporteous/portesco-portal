// Maps a student's grade (students.grade, readable by the coordinator) to the
// soccer age category shown in the class view. The pilot seed uses 7mo/9no/11vo.
// Anything unmapped falls back to "Otros" so no kid is ever dropped from the list.
//
// NOTE: do NOT derive the category from _pilot_parent_contacts.group_label — that
// table is admin-only (RLS), the coordinator cannot read it.

const GRADE_TO_CATEGORY: Record<string, string> = {
  "7mo": "U14",
  "9no": "U16",
  "11vo": "U18",
};

export const CATEGORY_ORDER = ["U14", "U16", "U18", "Otros"] as const;

export function categoryForGrade(grade: string | null | undefined): string {
  // `||` (not `??`) so empty-string / unmapped grades also fall back to "Otros".
  return (grade && GRADE_TO_CATEGORY[grade]) || "Otros";
}
