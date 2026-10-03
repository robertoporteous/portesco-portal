// GET /auth/callback — magic link landing.
// Exchanges PKCE code for a session, then redirects by role.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Sprint 4: links generados server-side (supabase/scripts/demo-login-link.ts)
  // llegan con token_hash en vez de code — patrón oficial de Supabase SSR.
  // Mismo one-time token, misma expiración; solo cambia el verbo de canje.
  const tokenHash = searchParams.get("token_hash");

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: "magiclink" });

  // Idempotencia (2 oct 2026): en iPhone un doble toque a "Entrar al Portal"
  // manda dos GET; el primero crea la sesión y el segundo encuentra el token
  // gastado. Antes el segundo ganaba la pantalla y mandaba a /login aunque la
  // cookie ya estuviera puesta. Si el canje falla pero YA hay sesión, seguimos.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (exchangeError && !user) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

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
    // Sprint 4: el profesor cae en su surface real (/professor, Bloque 3), no
    // en el stub /staff. El gate de voz sigue en proxy.ts (professor + admin).
    case "professor":
      return "/professor";
    case "parent":
    default:
      return "/";
  }
}
