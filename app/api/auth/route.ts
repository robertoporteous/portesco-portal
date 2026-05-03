// POST /api/auth/login — send magic link via Supabase Auth
// Sprint 1: stub — full implementation when Supabase is configured
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  // TODO: supabase.auth.signInWithOtp({ email })
  return NextResponse.json({ message: "Enlace enviado (Supabase pendiente)" });
}
