// Supabase clients for tests.
//
// - adminClient() — service_role, BYPASSES RLS. Use only for fixture
//   setup / teardown. NEVER expose to the asserts under test.
// - signInAsUser(email) — uses admin.generateLink + verifyOtp to mint a
//   real session WITHOUT sending an email. Returns an anon-key client
//   with that session attached, so calls flow through RLS exactly like a
//   real signed-in user.
//
// Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL +
// NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local (loaded by vitest.config.ts).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing env var ${name}. Tests need .env.local to define NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.`
    );
  }
  return v;
}

const SUPABASE_URL = envOrThrow('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function signInAsUser(email: string): Promise<SupabaseClient> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) {
    throw new Error(`generateLink failed for ${email}: ${error.message}`);
  }
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error(`No hashed_token returned for ${email}`);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: verifyError } = await userClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) {
    throw new Error(
      `verifyOtp failed for ${email}: ${verifyError.message}`
    );
  }
  return userClient;
}
