import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Professor surface auth gate (Bloque 3). Second line of defense — RLS is first,
// proxy.ts is edge. Professor + coordinator + admin enter; parent → "/".
//
// NOTE (spike, Tarea 1): proxy.ts no gatea aún el prefijo /professor, así que
// este layout es la única línea hasta Tarea 6 (cuando se agrega la regla al
// proxy). Roberto prueba el spike logueado como ADMIN, nunca como Alexander
// real (§6.6 higiene de métrica de adopción).
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
      profile.role === "coordinator" ||
      profile.role === "professor");

  if (!allowed) redirect("/");

  return <>{children}</>;
}
