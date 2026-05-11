// GET /api/health — Supabase connectivity smoke test.
// Uses service role to bypass RLS so we test the DB connection, not auth.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "missing_env" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { error, count } = await supabase
    .from("schools")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, schools_count: count ?? 0 });
}
