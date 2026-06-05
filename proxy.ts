// Root proxy (Next.js 16 — formerly middleware.ts).
// Refreshes the Supabase auth cookie and gates protected routes by role.
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that never require an authenticated session.
// Note: /api/* handles its own auth (cron, webhook, health) — proxy only
// refreshes cookies for them, never redirects.
const PUBLIC_PREFIXES = ["/login", "/auth", "/api"];

export async function proxy(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isPublic) {
    return supabaseResponse;
  }

  if (!user) {
    return redirectPreservingCookies(request, "/login", supabaseResponse);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  // No profile row yet → let the page render (empty state handled there).
  if (!profile) return supabaseResponse;

  const isAdmin = profile.is_admin || profile.role === "admin";
  const isCoordinator = profile.role === "coordinator";
  const isStaff =
    profile.role === "coordinator" || profile.role === "professor";

  if (pathname.startsWith("/admin") && !isAdmin) {
    return redirectPreservingCookies(
      request,
      isStaff ? "/staff" : "/",
      supabaseResponse
    );
  }

  // Coordinator Pad: coordinator + admin only. Professor has its own surface
  // (→ /staff for now); parent has none (→ /). Stricter than the generic /staff
  // gate, which also lets professors in.
  if (pathname.startsWith("/coordinator-pad") && !isAdmin && !isCoordinator) {
    return redirectPreservingCookies(
      request,
      isStaff ? "/staff" : "/",
      supabaseResponse
    );
  }

  if (pathname.startsWith("/staff") && !isAdmin && !isStaff) {
    return redirectPreservingCookies(request, "/", supabaseResponse);
  }

  return supabaseResponse;
}

function redirectPreservingCookies(
  request: NextRequest,
  destination: string,
  cookieSource: NextResponse
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  cookieSource.cookies.getAll().forEach((cookie) =>
    redirect.cookies.set(cookie.name, cookie.value)
  );
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
