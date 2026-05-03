// Cron job endpoint (called by Vercel Cron) — Sprint 1 stub
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
