// Sprint 2 Bloque 3 — RLS backing for PATCH /api/observations/[id]/confirm
// (Tarea 9, flujo A).
//
// The confirm endpoint validates ownership app-layer (returns 403 when the
// RLS-scoped SELECT of the observation comes back empty) and then writes with
// service_role. This suite proves the RLS layer that BACKS those guarantees,
// through real signed-in user clients (no mocks — AGENTS §4):
//
//   1. The author professor SEES their own pending observation (the SELECT the
//      route uses); an ajeno professor SEES null → that's the mechanism that
//      makes the route return 403.
//   2. The author CAN insert mention_assignments for their observation → the
//      trigger append_to_profile_observations populates profile_observations
//      (the child's profile only receives human-confirmed mentions — flujo A).
//   3. An ajeno professor CANNOT insert mention_assignments for that
//      observation (RLS author-insert policy) — first line of defense even if
//      the app-layer check were bypassed.
//   4. Idempotency: the atomic claim (UPDATE ... WHERE status='pending_confirmation')
//      succeeds once and is a no-op on a second confirm — no duplicate inserts
//      into a minor's profile.
//
// Fixture strategy mirrors tests/rls/sprint-2-write-side.test.ts: __rlstest_
// prefix on every natural identifier, dedicated test users (NEVER Alexander /
// Kassandra — PRD §6.6 adoption metric hygiene), defensive cleanup in beforeAll
// + afterAll, FK-safe teardown (children before parents; NEVER assume cascade).

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, signInAsUser } from '../_helpers/supabase';
import type { ConfirmationPayload } from '@/lib/ai/map-mentions';

const PREFIX = '__rlstest_';
const AUTHOR_EMAIL = `${PREFIX}confirm_author@portesco-test.com`;
const AJENO_EMAIL = `${PREFIX}confirm_ajeno@portesco-test.com`;
const PARENT_EMAIL = `${PREFIX}confirm_parent@portesco-test.com`;

type Fixtures = {
  authorId: string;
  ajenoId: string;
  parentId: string;
  schoolId: string;
  activityAId: string;
  activityBId: string;
  sessionAId: string;
  studentId: string;
  studentName: string;
  observationId: string;
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

async function cleanupRlsTestRows() {
  // FK-safe: prefixed students first — cascades enrollments, mention_assignments
  // (student_id), profile_observations (student_id + mention_id), student_profiles
  // (student_id). Then prefixed schools' activities (cascade sessions →
  // observations → mention_assignments by observation_id). Then observations by
  // author (defensive, must run before deleting the author user — author_id is
  // NO ACTION). Then schools. Then auth users (cascade public.users + staff).
  try {
    const { data: studentRows } = await admin
      .from('students')
      .select('id')
      .like('full_name', `${PREFIX}%`);
    const studentIds = (studentRows ?? []).map((r) => r.id as string);
    if (studentIds.length > 0) {
      await admin.from('students').delete().in('id', studentIds);
    }
  } catch {
    /* defensive */
  }
  try {
    const { data: schoolRows } = await admin
      .from('schools')
      .select('id')
      .like('name', `${PREFIX}%`);
    const schoolIds = (schoolRows ?? []).map((r) => r.id as string);
    if (schoolIds.length > 0) {
      const { data: actRows } = await admin
        .from('activities')
        .select('id')
        .in('school_id', schoolIds);
      const activityIds = (actRows ?? []).map((r) => r.id as string);
      if (activityIds.length > 0) {
        await admin.from('enrollments').delete().in('activity_id', activityIds);
        await admin.from('activities').delete().in('id', activityIds);
      }
    }
  } catch {
    /* defensive */
  }
  try {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const targets = (list?.users ?? []).filter((u) =>
      (u.email ?? '').startsWith(PREFIX)
    );
    const targetIds = targets.map((u) => u.id);
    if (targetIds.length > 0) {
      await admin.from('class_observations').delete().in('author_id', targetIds);
    }
    await admin.from('schools').delete().like('name', `${PREFIX}%`);
    for (const u of targets) {
      await admin.auth.admin.deleteUser(u.id);
    }
  } catch {
    /* defensive */
  }
}

async function createAuthUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${email}): ${error?.message ?? 'no user'}`);
  }
  return data.user.id;
}

async function insertPublicUser(
  id: string,
  email: string,
  role: 'professor' | 'parent',
  fullName: string
) {
  const { error } = await admin
    .from('users')
    .insert({ id, email, role, full_name: fullName, is_admin: false });
  if (error) throw new Error(`insert public.users(${email}): ${error.message}`);
}

beforeAll(async () => {
  await cleanupRlsTestRows();

  const authorId = await createAuthUser(AUTHOR_EMAIL);
  const ajenoId = await createAuthUser(AJENO_EMAIL);
  const parentId = await createAuthUser(PARENT_EMAIL);
  await insertPublicUser(authorId, AUTHOR_EMAIL, 'professor', `${PREFIX}Author`);
  await insertPublicUser(ajenoId, AJENO_EMAIL, 'professor', `${PREFIX}Ajeno`);
  await insertPublicUser(parentId, PARENT_EMAIL, 'parent', `${PREFIX}Parent`);

  const { data: school, error: eSchool } = await admin
    .from('schools')
    .insert({ name: `${PREFIX}confirm_school`, slug: `${PREFIX}confirm_school` })
    .select('id')
    .single();
  if (eSchool || !school) throw new Error(`insert school: ${eSchool?.message}`);

  const activityBase = { category: 'deporte' as const, monthly_price: 0 };
  const { data: aA, error: eA } = await admin
    .from('activities')
    .insert({ ...activityBase, school_id: school.id, name: `${PREFIX}confirm_actA` })
    .select('id')
    .single();
  if (eA || !aA) throw new Error(`insert activityA: ${eA?.message}`);

  const { data: aB, error: eB } = await admin
    .from('activities')
    .insert({ ...activityBase, school_id: school.id, name: `${PREFIX}confirm_actB` })
    .select('id')
    .single();
  if (eB || !aB) throw new Error(`insert activityB: ${eB?.message}`);

  // author teaches activityA, ajeno teaches activityB (a valid professor of the
  // same school, but NOT the author of the observation).
  const { error: eSA1 } = await admin
    .from('staff_activities')
    .insert({ user_id: authorId, activity_id: aA.id });
  if (eSA1) throw new Error(`staff_activities author: ${eSA1.message}`);
  const { error: eSA2 } = await admin
    .from('staff_activities')
    .insert({ user_id: ajenoId, activity_id: aB.id });
  if (eSA2) throw new Error(`staff_activities ajeno: ${eSA2.message}`);

  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const { data: sessionA, error: eSess } = await admin
    .from('class_sessions')
    .insert({
      activity_id: aA.id,
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
    })
    .select('id')
    .single();
  if (eSess || !sessionA) throw new Error(`insert sessionA: ${eSess?.message}`);

  const studentName = `${PREFIX}Confirm Student`;
  const { data: student, error: eStu } = await admin
    .from('students')
    .insert({
      school_id: school.id,
      parent_id: parentId,
      full_name: studentName,
      grade: '9no',
    })
    .select('id')
    .single();
  if (eStu || !student) throw new Error(`insert student: ${eStu?.message}`);

  const { error: eEnr } = await admin
    .from('enrollments')
    .insert({ student_id: student.id, activity_id: aA.id });
  if (eEnr) throw new Error(`insert enrollment: ${eEnr.message}`);

  // The observation the professor is about to confirm: resolved payload already
  // persisted (Tarea 8.1), status pending_confirmation, no mention_assignments
  // yet (flujo A — they land at confirm).
  const payload: ConfirmationPayload = {
    mentions: [
      {
        idx: 0,
        student_id: student.id,
        student_name: studentName,
        snippet: `${studentName} brilló en pases.`,
        sentiment: 'positive',
        confidence: 'high',
      },
    ],
    ambiguous: [],
    general_notes: '',
  };
  const { data: obs, error: eObs } = await admin
    .from('class_observations')
    .insert({
      session_id: sessionA.id,
      author_id: authorId,
      kind: 'voice_group',
      extraction_status: 'pending_confirmation',
      extraction_json: payload,
    })
    .select('id')
    .single();
  if (eObs || !obs) throw new Error(`insert observation: ${eObs?.message}`);

  fixtures = {
    authorId,
    ajenoId,
    parentId,
    schoolId: school.id,
    activityAId: aA.id,
    activityBId: aB.id,
    sessionAId: sessionA.id,
    studentId: student.id,
    studentName,
    observationId: obs.id,
  };
});

afterAll(async () => {
  clientByEmail.clear();
  await cleanupRlsTestRows();
});

// One confirmed mention row, exactly what buildConfirmedRows would produce for a
// "keep" decision on the single detected mention.
function confirmedRow(f: Fixtures) {
  return {
    observation_id: f.observationId,
    student_id: f.studentId,
    content_snippet: `${f.studentName} brilló en pases.`,
    sentiment: 'positive' as const,
    ai_confidence: 'high' as const,
    professor_corrected: false,
  };
}

describe('confirm RLS — ownership (drives the route 403)', () => {
  it('1. the author professor SEES their own pending observation', async () => {
    const client = await getClient(AUTHOR_EMAIL);
    const { data } = await client
      .from('class_observations')
      .select('id, author_id, extraction_status')
      .eq('id', fixtures.observationId)
      .maybeSingle();
    expect(data?.id).toBe(fixtures.observationId);
    expect(data?.author_id).toBe(fixtures.authorId);
  });

  it('2. an ajeno professor SEES null (→ route returns 403)', async () => {
    const client = await getClient(AJENO_EMAIL);
    const { data } = await client
      .from('class_observations')
      .select('id')
      .eq('id', fixtures.observationId)
      .maybeSingle();
    expect(data).toBeNull();
  });
});

describe('confirm RLS — the write (flujo A → trigger populates profile)', () => {
  it('3. an ajeno professor CANNOT insert a mention for that observation', async () => {
    const client = await getClient(AJENO_EMAIL);
    const { data, error } = await client
      .from('mention_assignments')
      .insert(confirmedRow(fixtures))
      .select('id')
      .single();
    expect(data).toBeNull();
    expect(error).not.toBeNull();

    // Nothing leaked into the profile.
    const { data: profRows } = await admin
      .from('profile_observations')
      .select('id')
      .eq('student_id', fixtures.studentId);
    expect(profRows ?? []).toEqual([]);
  });

  it('4. the author CAN insert → trigger appends to profile_observations', async () => {
    const client = await getClient(AUTHOR_EMAIL);
    const { data, error } = await client
      .from('mention_assignments')
      .insert(confirmedRow(fixtures))
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    // Trigger append_to_profile_observations fired.
    const { data: profRows } = await admin
      .from('profile_observations')
      .select('id, student_id, sentiment, confidence, professor_id')
      .eq('student_id', fixtures.studentId);
    expect(profRows?.length).toBe(1);
    expect(profRows?.[0]?.professor_id).toBe(fixtures.authorId);
    expect(profRows?.[0]?.sentiment).toBe('positive');

    // And the denormalized student_profiles snapshot was bumped.
    const { data: snap } = await admin
      .from('student_profiles')
      .select('observations_count')
      .eq('student_id', fixtures.studentId)
      .single();
    expect((snap?.observations_count ?? 0)).toBeGreaterThanOrEqual(1);
  });
});

describe('confirm RLS — idempotency (atomic claim)', () => {
  it('5. the pending→confirmed claim succeeds once and is a no-op the second time', async () => {
    // Mirrors the route's atomic claim (service_role in prod).
    const first = await admin
      .from('class_observations')
      .update({
        extraction_status: 'confirmed',
        confirmation_ts: new Date().toISOString(),
      })
      .eq('id', fixtures.observationId)
      .eq('extraction_status', 'pending_confirmation')
      .select('id');
    expect(first.error).toBeNull();
    expect(first.data?.length).toBe(1);

    const second = await admin
      .from('class_observations')
      .update({ extraction_status: 'confirmed' })
      .eq('id', fixtures.observationId)
      .eq('extraction_status', 'pending_confirmation')
      .select('id');
    expect(second.error).toBeNull();
    expect(second.data ?? []).toEqual([]); // no row still pending → no-op
  });
});
