// Parent-side attendance helpers (Sprint 4, T2).
//
// Everything here runs server-side on rows the parent is allowed to read by
// RLS (0010): class_sessions of their kids' activities and class_attendance of
// their own kids. No PII of other children ever reaches these functions.
//
// "Asistencia del mes" definition (PRD v1 A2/A3, kept simple on purpose):
//   Y = sessions of the kid's active activities, in the current Panama month,
//       that the coordinator already CLOSED (closed_at not null).
//   X = of those, sessions where the kid's row is 'present' or 'late'.
//   A closed session with no row for the kid counts as not attended (the
//   coordinator closed the class without marking them → shows as "Sin marcar").

import type { AttendanceStatus } from "@/lib/types";

const TZ = "America/Panama";

/**
 * Supabase embeds a to-one FK as an object at runtime but types it loosely; a
 * to-many as an array. Normalize either into an array so .map/.flatMap never
 * blow up (Sprint 4 T2 incident: `e.activities.map is not a function`).
 */
export function rel<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/** [start, end) of the current calendar month in Panama, as absolute Dates. */
export function panamaMonthRange(now = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00-05:00`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00-05:00`);
  return { start, end };
}

/** "octubre" — month name in Spanish, Panama calendar. */
export function panamaMonthName(now = new Date()): string {
  return new Intl.DateTimeFormat("es-PA", { timeZone: TZ, month: "long" }).format(now);
}

export type SessionRow = {
  id: string;
  activity_id: string;
  scheduled_start_at: string;
  closed_at: string | null;
};

export type AttendanceRow = {
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
};

export const ATTENDED: ReadonlySet<AttendanceStatus> = new Set(["present", "late"]);

export type MonthSummary = {
  attended: number; // X
  closed: number;   // Y
};

/**
 * Summary for ONE student: sessions already closed this month across their
 * activity ids, vs. the ones where they were present/late.
 */
export function monthSummaryFor(
  activityIds: ReadonlySet<string>,
  studentId: string,
  sessions: SessionRow[],
  attendance: AttendanceRow[],
): MonthSummary {
  const closed = sessions.filter((s) => activityIds.has(s.activity_id) && s.closed_at !== null);
  const closedIds = new Set(closed.map((s) => s.id));
  const attended = attendance.filter(
    (a) => a.student_id === studentId && closedIds.has(a.session_id) && ATTENDED.has(a.status),
  ).length;
  return { attended, closed: closed.length };
}

/** First future session among the given activity ids, or null. */
export function nextSessionFor(
  activityIds: ReadonlySet<string>,
  sessions: SessionRow[],
  now = new Date(),
): SessionRow | null {
  const nowMs = now.getTime();
  return (
    sessions
      .filter((s) => activityIds.has(s.activity_id) && new Date(s.scheduled_start_at).getTime() >= nowMs)
      .sort((a, b) => a.scheduled_start_at.localeCompare(b.scheduled_start_at))[0] ?? null
  );
}

/** Display mapping for a status chip. `null` = closed session with no row. */
export const STATUS_DISPLAY: Record<AttendanceStatus | "missing", { label: string; className: string }> = {
  present:    { label: "Presente",    className: "bg-emerald-100 text-emerald-800" },
  late:       { label: "Tarde",       className: "bg-orange-100 text-orange-800" },
  justified:  { label: "Justificado", className: "bg-amber-100 text-amber-800" },
  absent:     { label: "Ausente",     className: "bg-red-100 text-red-800" },
  not_marked: { label: "Sin marcar",  className: "bg-gray-100 text-gray-600" },
  missing:    { label: "Sin marcar",  className: "bg-gray-100 text-gray-600" },
};
