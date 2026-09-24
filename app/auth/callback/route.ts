// GET /auth/callback — magic link landing.
// Exchanges PKCE code for a session, then redirects by role.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_session`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const destination = resolveDestination(profile);
  return NextResponse.redirect(`${origin}${destination}`);
}

// Exportada para poder testearla sin levantar el server: es pura.
export function resolveDestination(
  profile: { role: string | null; is_admin: boolean | null } | null
): string {
  if (!profile) return "/";
  if (profile.is_admin) return "/admin";
  switch (profile.role) {
    case "admin":
      return "/admin";
    // El coordinator cae en su propio surface. Antes iba a /staff, que es el
    // stub "Panel del Profesor — Próximamente" de Sprint 1: una coordinadora
    // entrando por magic link llegaba a una pantalla vacía en vez de a sus
    // clases del día (Sprint 3, piloto CIDMI).
    case "coordinator":
      return "/coordinator-pad";
    case "professor":
      return "/staff";
    case "parent":
    default:
      return "/";
  }
}
