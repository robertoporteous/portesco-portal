"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

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
