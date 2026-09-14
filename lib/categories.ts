// Maps a student's grade (students.grade, readable by the coordinator) to the
// age category shown in the class view. CIDMI arma las categorías por PARES de
// grados: Kinder+1ero+2do = U8, 3ero+4to = U10, 5to+6to = U12, 7mo+8vo = U14,
// 9no+10mo = U16, 11vo+12vo = U18.
//
// El seed de Sprint 3 carga los 13 grados reales de CIDMI. Los niños cuyo grado
// no vino en el roster entran con el literal 'Sin grado' (students.grade es
// NOT NULL) y caen en "Otros", igual que cualquier valor no mapeado: nadie se
// pierde de la lista de asistencia.
//
// NOTE: do NOT derive the category from _pilot_parent_contacts.group_label — that
// table is admin-only (RLS), the coordinator cannot read it.

const GRADE_TO_CATEGORY: Record<string, string> = {
  Kinder: "U8",
  "1ero": "U8",
  "2do": "U8",
  "3ero": "U10",
  "4to": "U10",
  "5to": "U12",
  "6to": "U12",
  "7mo": "U14",
  "8vo": "U14",
  "9no": "U16",
  "10mo": "U16",
  "11vo": "U18",
  "12vo": "U18",
};

export const CATEGORY_ORDER = ["U8", "U10", "U12", "U14", "U16", "U18", "Otros"] as const;

export function categoryForGrade(grade: string | null | undefined): string {
  // `||` (not `??`) so empty-string / unmapped grades also fall back to "Otros".
  return (grade && GRADE_TO_CATEGORY[grade]) || "Otros";
}
