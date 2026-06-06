"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { panamaTodayRange } from "@/lib/dates";

// Statuses a coordinator can set from the class view (Presente/Ausente/Justificado).
// 'late' / 'not_marked' exist in the enum but aren't surfaced as buttons in slice 1.
export type MarkableStatus = "present" | "absent" | "justified";

type ActionResult = { ok: true } | { ok: false; error: string };

// Architecture §3.2: writes NEVER go directly from the browser — always a Server
// Action on an RLS-respecting client (NOT service_role), with auth.uid() verified
// server-side. RLS (class_attendance "coordinator session") is the first line:
// the UPSERT only succeeds for sessions of the coordinator's own school.
export async function markAttendance(input: {
  sessionId: string;
  studentId: string;
  status: MarkableStatus;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { error } = await supabase.from("class_attendance").upsert(
    {
      session_id: input.sessionId,
      student_id: input.studentId,
      status: input.status,
      marked_by: user.id,
      marked_at: new Date().toISOString(),
    },
    { onConflict: "session_id,student_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/coordinator-pad/sessions/${input.sessionId}`);
  return { ok: true };
}

// Eventuality types surfaced as chips (PRD §4.2). The enum also has
// 'tarea_pendiente' but it isn't a chip in this slice.
export type EventualityType =
  | "lesion"
  | "retiro_temprano"
  | "conflicto"
  | "comportamiento"
  | "tarde"
  | "otro";

export type EventualitySeverity = "info" | "attention" | "urgent";

// Records a per-kid eventuality. Append-only INSERT (no update path). RLS
// (class_eventualities "coordinator session") only allows it for sessions of
// the coordinator's own school. Allowed even on a closed session — incidents
// (e.g. injuries) are sometimes reported late and must not be blocked.
export async function addEventuality(input: {
  sessionId: string;
  studentId: string;
  type: EventualityType;
  severity: EventualitySeverity;
  notes?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { error } = await supabase.from("class_eventualities").insert({
    session_id: input.sessionId,
    student_id: input.studentId,
    type: input.type,
    severity: input.severity,
    notes: input.notes?.trim() || null,
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/coordinator-pad/sessions/${input.sessionId}`);
  return { ok: true };
}

// Soft close: stamp closed_at/closed_by. Completion ratio is derived post-hoc
// from class_attendance vs enrollments + timestamps — no "missing count" column.
export async function closeClass(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { error } = await supabase
    .from("class_sessions")
    .update({ closed_at: new Date().toISOString(), closed_by: user.id })
    .eq("id", sessionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/coordinator-pad/sessions/${sessionId}`);
  revalidatePath("/coordinator-pad");
  return { ok: true };
}

// Reopen a closed session to correct it. RLS limits the UPDATE to sessions of
// the coordinator's own school.
export async function reopenClass(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { error } = await supabase
    .from("class_sessions")
    .update({ closed_at: null, closed_by: null })
    .eq("id", sessionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/coordinator-pad/sessions/${sessionId}`);
  revalidatePath("/coordinator-pad");
  return { ok: true };
}

// Close every still-open session of TODAY (Panama) in one tap. Scope is two
// layers: the scheduled_start_at range pins it to today, and RLS (class_sessions
// "coordinator school") pins it to the coordinator's own school — sessions of
// another school, or of another day, are never touched.
export async function closeDay(): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { start, end } = panamaTodayRange();

  const { error } = await supabase
    .from("class_sessions")
    .update({ closed_at: new Date().toISOString(), closed_by: user.id })
    .gte("scheduled_start_at", start.toISOString())
    .lt("scheduled_start_at", end.toISOString())
    .is("closed_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/coordinator-pad");
  return { ok: true };
}
