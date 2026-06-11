// Sprint 2 Bloque 3 — RLS test for migration 0009
// "users: coordinator sees own-school staff".
//
// Validates the deuda §12 policy:
//   (a) A coordinator CAN read the users row (incl. full_name) of a PROFESSOR
//       of their own school — the COLA del Coordinator Pad needs the prof name.
//   (b) A coordinator of a DIFFERENT school CANNOT read that professor's row
//       (no cross-school staff leak).
//   (c) A coordinator CANNOT read any PARENT row (leak vector: users holds
//       parents with email/phone; the policy must never expose them).
//
// Fixture strategy (AGENTS.md §9):
//   - Dedicated sub-prefix __rlstest_staffvis_ on every identifier, so this
//     file's cleanup is scoped and never clobbers other RLS files. vitest runs
//     RLS files serially (fileParallelism:false), but scoping is belt+braces.
//   - Dedicated test users __rlstest_staffvis_*@portesco-test.com — NEVER
//     Kassandra / Alexander (PRD §6.6 adoption metric hygiene).
//   - Cached signed client per role (no signInAsUser per `it` → GoTrue verify
//     rate limit). FK-safe teardown, no assumed cascade.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, signInAsUser } from '../_helpers/supabase';

const PREFIX = '__rlstest_staffvis_';
const COORD_A_EMAIL = `${PREFIX}coorda@portesco-test.com`;
const PROF_A_EMAIL = `${PREFIX}profa@portesco-test.com`;
const COORD_B_EMAIL = `${PREFIX}coordb@portesco-test.com`;
const PARENT_EMAIL = `${PREFIX}parent@portesco-test.com`;

type Fixtures = {
  coordAId: string;
  profAId: string;
  coordBId: string;
  parentId: string;
  schoolAId: string;
  schoolBId: string;
};

let fixtures: Fixtures;
const admin = adminClient();

const clientByEmail = new Map<string, SupabaseClient>();
async function getClient(email: string): Promise<SupabaseClient> {
  let client = clientByEmail.get(email);
  if (!client) {
    client = await signInAsUser(email);
    clientByEmail.set(email, client);
  }
  return client;
}

async function cleanupRows() {
  // FK-safe teardown scoped to this file's sub-prefix. Order:
  //   1. students (cascade enrollments) — students.full_name prefixed
  //   2. activities of prefixed schools — clear enrollments (RESTRICT) first
  //   3. schools (now childless)
  //   4. auth users (cascade public.users + staff_schools + staff_activities)
  try {
    const { data: studentRows } = await admin
      .from('students').select('id').like('full_name', `${PREFIX}%`);
    const studentIds = (studentRows ?? []).map((r) => r.id as string);
    if (studentIds.length > 0) {
      await admin.from('students').delete().in('id', studentIds);
    }
  } catch { /* defensive */ }
  try {
    const { data: schoolRows } = await admin
      .from('schools').select('id').like('name', `${PREFIX}%`);
    const schoolIds = (schoolRows ?? []).map((r) => r.id as string);
    if (schoolIds.length > 0) {
      const { data: actRows } = await admin
        .from('activities').select('id').in('school_id', schoolIds);
      const activityIds = (actRows ?? []).map((r) => r.id as string);
      if (activityIds.length > 0) {
        await admin.from('enrollments').delete().in('activity_id', activityIds);
        await admin.from('activities').delete().in('id', activityIds);
      }
      await admin.from('schools').delete().in('id', schoolIds);
    }
  } catch { /* defensive */ }
  try {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const targets = (list?.users ?? []).filter((u) =>
      (u.email ?? '').startsWith(PREFIX)
    );
    for (const u of targets) {
      await admin.auth.admin.deleteUser(u.id);
    }
  } catch { /* defensive */ }
}

async function createAuthUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email, email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${email}): ${error?.message ?? 'no user'}`);
  }
  return data.user.id;
}

async function insertPublicUser(
  id: string,
  email: string,
  role: 'coordinator' | 'professor' | 'parent',
  fullName: string,
) {
  const { error } = await admin.from('users').insert({
    id, email, role, full_name: fullName, is_admin: false,
  });
  if (error) throw new Error(`insert users(${email}): ${error.message}`);
}

beforeAll(async () => {
  await cleanupRows();

  const coordAId = await createAuthUser(COORD_A_EMAIL);
  const profAId = await createAuthUser(PROF_A_EMAIL);
  const coordBId = await createAuthUser(COORD_B_EMAIL);
  const parentId = await createAuthUser(PARENT_EMAIL);

  await insertPublicUser(coordAId, COORD_A_EMAIL, 'coordinator', `${PREFIX}CoordA`);
  await insertPublicUser(profAId, PROF_A_EMAIL, 'professor', `${PREFIX}ProfA`);
  await insertPublicUser(coordBId, COORD_B_EMAIL, 'coordinator', `${PREFIX}CoordB`);
  await insertPublicUser(parentId, PARENT_EMAIL, 'parent', `${PREFIX}Parent`);

  const { data: schoolA, error: eA } = await admin
    .from('schools')
    .insert({ name: `${PREFIX}school_a`, slug: `${PREFIX}school_a` })
    .select('id').single();
  if (eA || !schoolA) throw new Error(`insert schoolA: ${eA?.message}`);

  const { data: schoolB, error: eB } = await admin
    .from('schools')
    .insert({ name: `${PREFIX}school_b`, slug: `${PREFIX}school_b` })
    .select('id').single();
  if (eB || !schoolB) throw new Error(`insert schoolB: ${eB?.message}`);

  // Activity in school A so profA links to school A via staff_activities.
  const { data: actA, error: eAct } = await admin
    .from('activities')
    .insert({
      category: 'deporte', monthly_price: 0,
      school_id: schoolA.id, name: `${PREFIX}activity_a`,
    })
    .select('id').single();
  if (eAct || !actA) throw new Error(`insert activityA: ${eAct?.message}`);

  // Staff assignments: coordA → school A (coordinator), coordB → school B
  // (coordinator), profA → activity in school A (professor).
  const { error: eSS1 } = await admin.from('staff_schools').insert({
    user_id: coordAId, school_id: schoolA.id, role: 'coordinator',
  });
  if (eSS1) throw new Error(`staff_schools coordA: ${eSS1.message}`);

  const { error: eSS2 } = await admin.from('staff_schools').insert({
    user_id: coordBId, school_id: schoolB.id, role: 'coordinator',
  });
  if (eSS2) throw new Error(`staff_schools coordB: ${eSS2.message}`);

  const { error: eSA } = await admin.from('staff_activities').insert({
    user_id: profAId, activity_id: actA.id,
  });
  if (eSA) throw new Error(`staff_activities profA: ${eSA.message}`);

  // Parent with a child in school A → "related" to school A, yet must stay
  // invisible to coordA (the policy filters role, not relationship).
  const { error: eStu } = await admin.from('students').insert({
    school_id: schoolA.id, parent_id: parentId,
    full_name: `${PREFIX}Student A`, grade: '9no',
  });
  if (eStu) throw new Error(`insert student: ${eStu.message}`);

  fixtures = {
    coordAId, profAId, coordBId, parentId,
    schoolAId: schoolA.id, schoolBId: schoolB.id,
  };
});

afterAll(async () => {
  clientByEmail.clear();
  await cleanupRows();
});

describe('RLS 0009 — users: coordinator sees own-school staff', () => {
  it('(a) coordinator CAN read full_name of a professor of own school', async () => {
    const client = await getClient(COORD_A_EMAIL);
    const { data, error } = await client
      .from('users')
      .select('id, full_name, role')
      .eq('id', fixtures.profAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(fixtures.profAId);
    expect(data?.full_name).toBe(`${PREFIX}ProfA`);
    expect(data?.role).toBe('professor');
  });

  it('(b) coordinator of another school CANNOT read that professor', async () => {
    const client = await getClient(COORD_B_EMAIL);
    const { data, error } = await client
      .from('users')
      .select('id')
      .eq('id', fixtures.profAId)
      .maybeSingle();
    expect(error).toBeNull(); // RLS filters rows, not an error
    expect(data).toBeNull();
  });

  it('(c) coordinator CANNOT read any parent row (leak vector)', async () => {
    const client = await getClient(COORD_A_EMAIL);
    const { data, error } = await client
      .from('users')
      .select('id')
      .eq('id', fixtures.parentId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('(c2) the policy returns ONLY staff roles for the coordinator', async () => {
    // Belt+braces: coordA lists every users row it can see; none may be a parent.
    const client = await getClient(COORD_A_EMAIL);
    const { data, error } = await client.from('users').select('id, role');
    expect(error).toBeNull();
    const roles = (data ?? []).map((r) => r.role);
    expect(roles).not.toContain('parent');
    // coordA must at least see itself + profA.
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(fixtures.coordAId);
    expect(ids).toContain(fixtures.profAId);
  });

  it('(d) a PROFESSOR gains NO staff visibility from the policy', async () => {
    // The policy benefits coordinators only — a professor calling it gets an
    // empty set from user_school_ids_as_coordinator(). profA must see neither
    // its own coordinator (coordA) nor coordB; only itself (via "users: self").
    const client = await getClient(PROF_A_EMAIL);

    const { data: coordRow, error: e1 } = await client
      .from('users').select('id').eq('id', fixtures.coordAId).maybeSingle();
    expect(e1).toBeNull();
    expect(coordRow).toBeNull();

    const { data, error } = await client.from('users').select('id');
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(fixtures.profAId); // self only
    expect(ids).not.toContain(fixtures.coordAId);
    expect(ids).not.toContain(fixtures.coordBId);
  });
});
