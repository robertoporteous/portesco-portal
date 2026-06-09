// Supabase service_role client — SERVER-ONLY. Bypasses RLS.
//
// Use exclusively from server-side AI pipeline code (lib/ai/whisper.ts,
// lib/ai/claude.ts, /api/observations/voice). NEVER import from a Client
// Component or expose the returned client to the browser — the service_role
// key bypasses every RLS policy (AGENTS.md §5, defense in depth).
//
// Why a dedicated client (not lib/supabase/server.ts): the async transcription/
// extraction jobs run outside a request's cookie context and must read the
// private voice-obs bucket + write audit_logs, both of which need service_role
// (Architecture §4.1 "download de Storage service_role, bypassa RLS"; §7.1
// "service_role lee desde el server").
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "createServiceClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
