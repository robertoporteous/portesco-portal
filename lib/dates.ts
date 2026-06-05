// Date helpers for the Coordinator Pad.
//
// CRITICAL: "today" is computed in America/Panama, NOT in the server's UTC
// (Vercel runs UTC). Panama is a fixed UTC-5 (no DST), so a class at 22:00 UTC
// on Jun 9 is still Jun 9 in Panama. Filtering by UTC date would shift the day.

const TZ = "America/Panama";

/**
 * The [start, end) instants that bound "today" in Panama, as absolute Dates.
 * Use with timestamptz columns: `.gte(start.toISOString()).lt(end.toISOString())`.
 */
export function panamaTodayRange(): { start: Date; end: Date } {
  // "YYYY-MM-DD" of the current calendar day in Panama.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const start = new Date(`${today}T00:00:00-05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000); // +24h (no DST)
  return { start, end };
}

function panamaDateParts(d: Date): { weekday: string; day: string; month: string } {
  const parts = new Intl.DateTimeFormat("es-PA", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month").replace(".", ""),
  };
}

/** "martes 9 jun" — Panama calendar date, lowercase, no comma. */
export function formatPanamaDate(d: Date): string {
  const { weekday, day, month } = panamaDateParts(d);
  return `${weekday} ${day} ${month}`;
}

/** "5:00 PM" — Panama wall-clock time. */
export function formatPanamaTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** "martes 9 jun, 5:00 PM" — used by the "Próxima:" empty state. */
export function formatPanamaNextSession(d: Date): string {
  return `${formatPanamaDate(d)}, ${formatPanamaTime(d)}`;
}
