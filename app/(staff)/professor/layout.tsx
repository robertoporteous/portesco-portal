import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Professor surface auth gate. Second line of defense — RLS is first, proxy.ts
// is edge. Professor + admin entran; coordinator → "/coordinator-pad";
// parent → "/".
//
// GATE(voice-launch) (AGENTS.md §12): Bloque 3 dejaba entrar al coordinator acá
// y en proxy.ts. Se cerró en Sprint 3 Tarea 6, cuando el piloto le dio acceso
// real a una coordinadora: la voz sigue parqueada hasta el code review
// adversarial, y con la regla vieja a Kassandra le alcanzaba con tipear
// /professor para llegar al grabador. Se revierte con la COLA de Bloque 4 (T11),
// pero recién después de pasar el gate.
//
// Roberto prueba logueado como ADMIN, nunca como Alexander real (§6.6 higiene
// de métrica de adopción).
export default async function ProfessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const allowed =
    !!profile &&
    (profile.is_admin ||
      profile.role === "admin" ||
      profile.role === "professor");

  if (!allowed) {
    redirect(profile?.role === "coordinator" ? "/coordinator-pad" : "/");
  }

  return <>{children}</>;
}
