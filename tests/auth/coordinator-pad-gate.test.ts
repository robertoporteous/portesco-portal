// Auth gate for /coordinator-pad — negative-case regression guard.
//
// What this proves (decision #6), for the pad ROOT *and* a nested sub-route
// (/coordinator-pad/sessions/<id>, the roster page that renders minors' names):
//   parent      → redirect to "/"
//   professor   → redirect to "/staff"
//   coordinator → allowed (no redirect)
//   admin       → allowed (no redirect)
// The sub-route case pins the proxy's `startsWith("/coordinator-pad")` gate so a
// future refactor to exact-path matching can't silently de-protect nested pages.
//
// How: we import the REAL `proxy` (proxy.ts, the edge gate) and call it with a
// genuine Supabase auth cookie for each role — the same cookie @supabase/ssr
// would set in the browser, minted here via generateLink + verifyOtp through an
// in-memory cookie jar. proxy.ts is what emits the observable redirect; the
// layout.tsx guard is the redundant second line behind it (defense in depth).
// This covers the proxy edge gate only (not the layout guard). No dev server.
//
// Fixtures use the dedicated sub-prefix __rlstest_gate_ (isolated from the
// RLS write-side suite's __rlstest_ users) and dedicated test auth users —
// NEVER Kassandra/Alexander/Roberto (AGENTS.md §6.6 adoption-metric hygiene).
// Cleanup is FK-safe (AGENTS.md §9): these users create no RESTRICT children,
// so deleting the auth user cascades public.users. npm test stays repeatable.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PREFIX = '__rlstest_gate_';
const EMAILS = {
  parent: `${PREFIX}parent@portesco-test.com`,
  professor: `${PREFIX}prof@portesco-test.com`,
  coordinator: `${PREFIX}coord@portesco-test.com`,
  admin: `${PREFIX}admin@portesco-test.com`,
} as const;

type Role = 'parent' | 'professor' | 'coordinator' | 'admin';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// In-memory cookie jar mirroring the @supabase/ssr cookie adapter contract.
function makeJar() {
  const store = new Map<string, string>();
  return {
    adapter: {
      getAll: () =>
        [...store.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies: { name: string; value: string }[]) =>
        cookies.forEach(({ name, value }) => store.set(name, value)),
    },
    dump: () => [...store.entries()].map(([name, value]) => ({ name, value })),
  };
}

// Mint the exact auth cookie(s) @supabase/ssr would set for a signed-in user.
async function sessionCookiesFor(email: string) {
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error || !link?.properties?.hashed_token) {
    throw new Error(`generateLink(${email}) failed: ${error?.message}`);
  }
  const jar = makeJar();
  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: jar.adapter,
  });
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError) {
    throw new Error(`verifyOtp(${email}) failed: ${verifyError.message}`);
  }
  const cookies = jar.dump();
  if (cookies.length === 0) {
    throw new Error(`no auth cookies captured for ${email}`);
  }
  return cookies;
}

async function createGateUser(email: string, role: Role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${email}) failed: ${error?.message}`);
  }
  const { error: insertError } = await admin.from('users').insert({
    id: data.user.id,
    email,
    role,
    full_name: `${PREFIX}${role}`,
    is_admin: role === 'admin',
  });
  if (insertError) {
    throw new Error(`insert public.users(${email}): ${insertError.message}`);
  }
}

async function cleanup() {
  try {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const targets = (list?.users ?? []).filter((u) =>
      (u.email ?? '').startsWith(PREFIX)
    );
    for (const u of targets) {
      await admin.auth.admin.deleteUser(u.id);
    }
  } catch {
    /* defensive — best effort */
  }
}

// Cache the auth cookies per role so calling gateFor for multiple paths doesn't
// re-mint a session each time (Supabase rate-limits verifyOtp — AGENTS.md §9).
const cookieCache = new Map<string, { name: string; value: string }[]>();
async function cookiesFor(email: string) {
  let cookies = cookieCache.get(email);
  if (!cookies) {
    cookies = await sessionCookiesFor(email);
    cookieCache.set(email, cookies);
  }
  return cookies;
}

// Run a request for `email` at `path` through the real proxy; return the
// observable redirect (status + Location pathname), or location=null when
// allowed through.
async function gateFor(email: string, path = '/coordinator-pad') {
  const cookies = await cookiesFor(email);
  const request = new NextRequest(`http://localhost${path}`);
  for (const { name, value } of cookies) {
    request.cookies.set(name, value);
  }
  const response = await proxy(request);
  const location = response.headers.get('location');
  return {
    status: response.status,
    pathname: location ? new URL(location).pathname : null,
  };
}

beforeAll(async () => {
  await cleanup();
  await createGateUser(EMAILS.parent, 'parent');
  await createGateUser(EMAILS.professor, 'professor');
  await createGateUser(EMAILS.coordinator, 'coordinator');
  await createGateUser(EMAILS.admin, 'admin');
});

afterAll(async () => {
  cookieCache.clear();
  await cleanup();
});

// Run the full role matrix against the pad root AND a nested session sub-route.
// The proxy doesn't validate the session id (it only gates by path prefix +
// role), so a dummy id is enough to exercise the sub-route.
const PATHS = [
  { label: 'root', path: '/coordinator-pad' },
  {
    label: 'session sub-route',
    path: '/coordinator-pad/sessions/00000000-0000-0000-0000-000000000000',
  },
];

describe.each(PATHS)('/coordinator-pad auth gate (proxy.ts) — $label', ({ path }) => {
  it('parent → redirected to /', async () => {
    const { pathname } = await gateFor(EMAILS.parent, path);
    expect(pathname).toBe('/');
  });

  it('professor → redirected to /staff', async () => {
    const { pathname } = await gateFor(EMAILS.professor, path);
    expect(pathname).toBe('/staff');
  });

  it('coordinator → allowed through (no redirect)', async () => {
    const { pathname } = await gateFor(EMAILS.coordinator, path);
    expect(pathname).toBeNull();
  });

  it('admin → allowed through (no redirect)', async () => {
    const { pathname } = await gateFor(EMAILS.admin, path);
    expect(pathname).toBeNull();
  });
});
