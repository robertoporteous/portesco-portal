// Route protection proxy — Sprint 1
// Next.js 16: middleware.ts renamed to proxy.ts
// Protects parent (/), staff (/staff/*), and admin (/admin/*) routes by role
// Full auth check added when Supabase is configured

import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // TODO: call updateSession(request) from lib/supabase/middleware once Supabase is set up
  // TODO: check auth cookie and user role, then redirect unauthorized access:
  //   - Unauthenticated users hitting / → redirect to /login
  //   - Parents hitting /staff or /admin → redirect to /
  //   - Staff hitting /admin → redirect to /staff
  //   - Admin has access everywhere

  // For now: allow all traffic through (open skeleton)
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
