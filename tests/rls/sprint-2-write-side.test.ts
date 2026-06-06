// Sprint 2 RLS — write-side tests for class_observations + bi_weekly_reports.
//
// Validates that:
//   1. A coordinator can INSERT class_observations into a session of their
//      own school, but CANNOT into a session belonging to another school.
//   2. A professor can INSERT into a session of an activity they teach,
//      but CANNOT into another activity (even within the same school).
//   3. A parent gets 0 rows on SELECT bi_weekly_reports (no parent policy
//      exists in Sprint 2 — parent_visible=false hardcoded).
//   4. An admin gets >=1 rows on SELECT bi_weekly_reports.
//
// Fixture strategy (AGENTS.md §9, recurring-error rules):
//   - Every row created here is prefixed __rlstest_ in its natural identifier
//     (school.name, activity.name, student.full_name, user email).
//   - beforeAll does a defensive cleanup of every prefixed row before
//     inserting, wrapped in try/catch, so a previous failed run cannot
//     corrupt this one.
//   - Dedicated test users (__rlstest_coord, __rlstest_prof, etc.) — NEVER
//     Kassandra / Alexander / Roberto. Protects PRD §6.6 adoption metrics.
//   - afterAll repeats the cleanup.
//
// Auth strategy: signInAsUser uses admin.generateLink + verifyOtp on the
// anon client, so the resulting client makes RLS-enforced calls exactly
// like a real signed-in user.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, signInAsUser } from '../_helpers/supabase';
import { panamaTodayRange } from '@/lib/dates';

const PREFIX = '__rlstest_';
const COORD_EMAIL  = `${PREFIX}coord@portesco-test.com`;
const PROF_EMAIL   = `${PREFIX}prof@portesco-test.com`;
const ADMIN_EMAIL  = `${PREFIX}admin@portesco-test.com`;
const PARENT_EMAIL = `${PREFIX}parent@portesco-test.com`;

type Fixtures = {
  coordId: string;
  profId: string;
  adminId: string;
  parentId: string;
  schoolMainId: string;
  schoolOtherId: string;
  activityMainId: string;
  activityMainOtherId: string;
  activityOtherId: string;
  sessionMainId: string;
  sessionMainOtherId: string;
  sessionOtherId: string;
  sessionMainPastId: string;
  studentId: string;
  reportId: string;
};

let fixtures: Fixtures;

const admin = adminClient();

// Cache one signed-in client per role. signInAsUser mints a magic link +
// verifyOtp, and Supabase rate-limits the verify endpoint; signing in once per
// role (not once per test) keeps `npm test` repeatable across consecutive runs.
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
  // FK-safe teardown. NEVER assume ON DELETE CASCADE — verify each FK (AGENTS.md
  // §9). Several FKs that look cascade-y are actually RESTRICT / NO ACTION, so
  // children MUST be deleted before parents:
  //   - activities.school_id         → RESTRICT  (deleting a school does NOT
  //                                     remove its activities; this was the bug)
  //   - enrollments.activity_id      → RESTRICT
  //   - class_observations.author_id → NO ACTION (a surviving observation blocks
  //                                     deleting its author user → deleteUser
  //                                     fails silently → stale state next run)
  // These DO cascade: class_sessions.activity_id, class_observations.session_id,
  // and every student_id FK (enrollments, bi_weekly_reports, profile_observations).
  //
  // Order:
  //   1. prefixed students → cascades their enrollments / bi_weekly_reports /
  //      profile_observations
  //   2. activities of prefixed schools → clear leftover enrollments (RESTRICT)
  //      first, then delete activities → cascades sessions → observations,
  //      attendance, eventualities (removes the author_id references)
  //   3. class_observations still authored by the test users (defensive; should
  //      already be 0 after step 2) — must run before deleting those users
  //   4. prefixed schools (now childless)
  //   5. prefixed auth users → cascades public.users + staff_schools/activities
  try {
    const { data: studentRows } = await admin
      .from('students')
      .select('id')
      .like('full_name', `${PREFIX}%`);
    const studentIds = (studentRows ?? []).map((r) => r.id as string);
    if (studentIds.length > 0) {
      await admin.from('bi_weekly_reports').delete().in('student_id', studentIds);
      await admin.from('students').delete().in('id', studentIds);
    }
  } catch {
    /* defensive — best effort */
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
        // enrollments.activity_id is RESTRICT — clear before deleting activities.
        await admin.from('enrollments').delete().in('activity_id', activityIds);
        // activities → cascade class_sessions → class_observations / attendance.
        await admin.from('activities').delete().in('id', activityIds);
      }
    }
  } catch {
    /* defensive */
  }
  try {
    // List the prefixed auth users (no direct LIKE on auth.users via the admin
    // API). 1000 is way more than we'd ever have at __rlstest_.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const targets = (list?.users ?? []).filter((u) =>
      (u.email ?? '').startsWith(PREFIX)
    );
    const targetIds = targets.map((u) => u.id);
    if (targetIds.length > 0) {
      // class_observations.author_id is NO ACTION — any leftover authored row
      // would block deleteUser. Remove them before deleting the users.
      await admin.from('class_observations').delete().in('author_id', targetIds);
    }
    // Schools are childless now (activities gone in the previous block).
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
    throw new Error(`createUser(${email}) failed: ${error?.message ?? 'no user returned'}`);
  }
  return data.user.id;
}

async function insertPublicUser(
  id: string,
  email: string,
  role: 'coordinator' | 'professor' | 'admin' | 'parent',
  fullName: string,
) {
  const { error } = await admin.from('users').insert({
    id,
    email,
    role,
    full_name: fullName,
    is_admin: role === 'admin',  // is_admin() helper reads this column, NOT role.
  });
  if (error) throw new Error(`insert public.users(${email}): ${error.message}`);
}

beforeAll(async () => {
  await cleanupRlsTestRows();

  // --- Auth users + public.users rows --------------------------------------

  const coordId  = await createAuthUser(COORD_EMAIL);
  const profId   = await createAuthUser(PROF_EMAIL);
  const adminId  = await createAuthUser(ADMIN_EMAIL);
  const parentId = await createAuthUser(PARENT_EMAIL);

  await insertPublicUser(coordId,  COORD_EMAIL,  'coordinator', `${PREFIX}Coord`);
  await insertPublicUser(profId,   PROF_EMAIL,   'professor',   `${PREFIX}Prof`);
  await insertPublicUser(adminId,  ADMIN_EMAIL,  'admin',       `${PREFIX}Admin`);
  await insertPublicUser(parentId, PARENT_EMAIL, 'parent',      `${PREFIX}Parent`);

  // --- Schools --------------------------------------------------------------

  const { data: schoolMain, error: e1 } = await admin
    .from('schools')
    .insert({ name: `${PREFIX}school_main`, slug: `${PREFIX}school_main` })
    .select('id').single();
  if (e1 || !schoolMain) throw new Error(`insert schoolMain: ${e1?.message}`);

  const { data: schoolOther, error: e2 } = await admin
    .from('schools')
    .insert({ name: `${PREFIX}school_other`, slug: `${PREFIX}school_other` })
    .select('id').single();
  if (e2 || !schoolOther) throw new Error(`insert schoolOther: ${e2?.message}`);

  // --- Activities ----------------------------------------------------------

  const activityBase = { category: 'deporte' as const, monthly_price: 0 };

  const { data: aMain, error: e3 } = await admin
    .from('activities')
    .insert({ ...activityBase, school_id: schoolMain.id, name: `${PREFIX}activity_main` })
    .select('id').single();
  if (e3 || !aMain) throw new Error(`insert activityMain: ${e3?.message}`);

  const { data: aMainOther, error: e4 } = await admin
    .from('activities')
    .insert({ ...activityBase, school_id: schoolMain.id, name: `${PREFIX}activity_main_other` })
    .select('id').single();
  if (e4 || !aMainOther) throw new Error(`insert activityMainOther: ${e4?.message}`);

  const { data: aOther, error: e5 } = await admin
    .from('activities')
    .insert({ ...activityBase, school_id: schoolOther.id, name: `${PREFIX}activity_other` })
    .select('id').single();
  if (e5 || !aOther) throw new Error(`insert activityOther: ${e5?.message}`);

  // --- Staff assignments ---------------------------------------------------

  const { error: e6 } = await admin.from('staff_schools').insert({
    user_id: coordId, school_id: schoolMain.id, role: 'coordinator',
  });
  if (e6) throw new Error(`staff_schools coord: ${e6.message}`);

  const { error: e7 } = await admin.from('staff_activities').insert({
    user_id: profId, activity_id: aMain.id,
  });
  if (e7) throw new Error(`staff_activities prof: ${e7.message}`);

  // --- Class sessions (one per activity) -----------------------------------

  const start = new Date();
  const end   = new Date(start.getTime() + 60 * 60 * 1000);

  const sessionRows = [
    { activity_id: aMain.id,      scheduled_start_at: start.toISOString(), scheduled_end_at: end.toISOString() },
    { activity_id: aMainOther.id, scheduled_start_at: start.toISOString(), scheduled_end_at: end.toISOString() },
    { activity_id: aOther.id,     scheduled_start_at: start.toISOString(), scheduled_end_at: end.toISOString() },
  ];
  const { data: sessions, error: e8 } = await admin
    .from('class_sessions')
    .insert(sessionRows)
    .select('id, activity_id');
  if (e8 || !sessions || sessions.length !== 3) {
    throw new Error(`insert class_sessions: ${e8?.message}`);
  }
  const sessionByActivity = new Map<string, string>(
    sessions.map((s) => [s.activity_id as string, s.id as string])
  );

  // A past-dated open session in school A (activityMain), OUTSIDE today's Panama
  // range — used to prove closeDay's date filter only closes today's sessions.
  const pastStart = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(pastStart.getTime() + 60 * 60 * 1000);
  const { data: pastSession, error: e8b } = await admin
    .from('class_sessions')
    .insert({
      activity_id: aMain.id,
      scheduled_start_at: pastStart.toISOString(),
      scheduled_end_at: pastEnd.toISOString(),
    })
    .select('id').single();
  if (e8b || !pastSession) throw new Error(`insert past session: ${e8b?.message}`);

  // --- Student + enrollment + report ---------------------------------------

  const { data: student, error: e9 } = await admin
    .from('students')
    .insert({
      school_id: schoolMain.id,
      parent_id: parentId,
      full_name: `${PREFIX}Student One`,
      grade: '9no', // real seed grade convention (maps to U16); see lib/categories
    })
    .select('id').single();
  if (e9 || !student) throw new Error(`insert student: ${e9?.message}`);

  const { error: e10 } = await admin.from('enrollments').insert({
    student_id: student.id, activity_id: aMain.id,
  });
  if (e10) throw new Error(`insert enrollment: ${e10.message}`);

  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const { data: report, error: e11 } = await admin
    .from('bi_weekly_reports')
    .insert({
      student_id:   student.id,
      activity_id:  aMain.id,
      cycle_number: 1,
      period_start: twoWeeksAgo.toISOString().slice(0, 10),
      period_end:   today.toISOString().slice(0, 10),
      status:       'draft_pending_review',
      parent_visible: false,
    })
    .select('id').single();
  if (e11 || !report) throw new Error(`insert bi_weekly_report: ${e11?.message}`);

  fixtures = {
    coordId,
    profId,
    adminId,
    parentId,
    schoolMainId:       schoolMain.id,
    schoolOtherId:      schoolOther.id,
    activityMainId:     aMain.id,
    activityMainOtherId: aMainOther.id,
    activityOtherId:    aOther.id,
    sessionMainId:      sessionByActivity.get(aMain.id)!,
    sessionMainOtherId: sessionByActivity.get(aMainOther.id)!,
    sessionOtherId:     sessionByActivity.get(aOther.id)!,
    sessionMainPastId:  pastSession.id,
    studentId:          student.id,
    reportId:           report.id,
  };
});

afterAll(async () => {
  clientByEmail.clear();
  await cleanupRlsTestRows();
});

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

async function tryInsertObservation(
  client: SupabaseClient,
  sessionId: string,
  authorId: string,
) {
  return client.from('class_observations').insert({
    session_id: sessionId,
    author_id:  authorId,
    kind:       'voice_group',
  }).select('id').single();
}

describe('Sprint 2 RLS — class_observations INSERT (coordinator)', () => {
  it('1. coordinator CAN insert into a session of own school', async () => {
    const client = await getClient(COORD_EMAIL);
    const { data, error } = await tryInsertObservation(
      client, fixtures.sessionMainId, fixtures.coordId,
    );
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it('2. coordinator CANNOT insert into a session of another school', async () => {
    const client = await getClient(COORD_EMAIL);
    const { data, error } = await tryInsertObservation(
      client, fixtures.sessionOtherId, fixtures.coordId,
    );
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('Sprint 2 RLS — class_observations INSERT (professor)', () => {
  it('3. professor CAN insert into a session of their own activity', async () => {
    const client = await getClient(PROF_EMAIL);
    const { data, error } = await tryInsertObservation(
      client, fixtures.sessionMainId, fixtures.profId,
    );
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it('4. professor CANNOT insert into a session of another activity', async () => {
    const client = await getClient(PROF_EMAIL);
    const { data, error } = await tryInsertObservation(
      client, fixtures.sessionMainOtherId, fixtures.profId,
    );
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('Sprint 2 RLS — bi_weekly_reports SELECT', () => {
  it('5. parent gets 0 rows (no parent policy in Sprint 2)', async () => {
    const client = await getClient(PARENT_EMAIL);
    const { data, error } = await client
      .from('bi_weekly_reports')
      .select('id')
      .eq('id', fixtures.reportId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('6. admin sees the report (>=1 rows, no error)', async () => {
    const client = await getClient(ADMIN_EMAIL);
    const { data, error } = await client
      .from('bi_weekly_reports')
      .select('id')
      .eq('id', fixtures.reportId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

// Mirrors what the markAttendance Server Action does, through an RLS-respecting
// client signed in as the coordinator (NOT service_role).
async function upsertAttendance(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
  status: 'present' | 'absent' | 'justified',
  markedBy: string,
) {
  return client
    .from('class_attendance')
    .upsert(
      {
        session_id: sessionId,
        student_id: studentId,
        status,
        marked_by: markedBy,
        marked_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,student_id' },
    )
    .select('id, status, marked_by')
    .single();
}

describe('Sprint 2 RLS — class_attendance UPSERT (coordinator)', () => {
  it('7. coordinator CAN upsert attendance in a session of own school', async () => {
    const client = await getClient(COORD_EMAIL);
    const { data, error } = await upsertAttendance(
      client, fixtures.sessionMainId, fixtures.studentId, 'present', fixtures.coordId,
    );
    expect(error).toBeNull();
    expect(data?.status).toBe('present');
    expect(data?.marked_by).toBe(fixtures.coordId);
  });

  it('8. re-upsert updates the same row (on conflict session_id,student_id)', async () => {
    const client = await getClient(COORD_EMAIL);
    const { error } = await upsertAttendance(
      client, fixtures.sessionMainId, fixtures.studentId, 'absent', fixtures.coordId,
    );
    expect(error).toBeNull();

    // Exactly one row for this (session, student), now 'absent'.
    const { data: rows } = await admin
      .from('class_attendance')
      .select('id, status')
      .eq('session_id', fixtures.sessionMainId)
      .eq('student_id', fixtures.studentId);
    expect(rows?.length).toBe(1);
    expect(rows?.[0]?.status).toBe('absent');
  });

  it('9. coordinator CANNOT upsert attendance in another school\'s session', async () => {
    const client = await getClient(COORD_EMAIL);
    const { data, error } = await upsertAttendance(
      client, fixtures.sessionOtherId, fixtures.studentId, 'present', fixtures.coordId,
    );
    expect(data).toBeNull();
    expect(error).not.toBeNull();

    // And nothing leaked into the other school's session.
    const { data: rows } = await admin
      .from('class_attendance')
      .select('id')
      .eq('session_id', fixtures.sessionOtherId);
    expect(rows ?? []).toEqual([]);
  });
});

// Mirrors the addEventuality Server Action: append-only INSERT through an
// RLS-respecting client signed in as the coordinator.
async function insertEventuality(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
  createdBy: string,
) {
  return client
    .from('class_eventualities')
    .insert({
      session_id: sessionId,
      student_id: studentId,
      type: 'lesion',
      severity: 'info',
      notes: '__rlstest_ eventuality',
      created_by: createdBy,
    })
    .select('id, created_by')
    .single();
}

describe('Sprint 2 RLS — class_eventualities INSERT (coordinator)', () => {
  it('10. coordinator CAN insert an eventuality in a session of own school', async () => {
    const client = await getClient(COORD_EMAIL);
    const { data, error } = await insertEventuality(
      client, fixtures.sessionMainId, fixtures.studentId, fixtures.coordId,
    );
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.created_by).toBe(fixtures.coordId);
  });

  it('11. coordinator CANNOT insert an eventuality in another school\'s session', async () => {
    const client = await getClient(COORD_EMAIL);
    const { data, error } = await insertEventuality(
      client, fixtures.sessionOtherId, fixtures.studentId, fixtures.coordId,
    );
    expect(data).toBeNull();
    expect(error).not.toBeNull();

    const { data: rows } = await admin
      .from('class_eventualities')
      .select('id')
      .eq('session_id', fixtures.sessionOtherId);
    expect(rows ?? []).toEqual([]);
  });
});

describe('Sprint 2 RLS — reopenClass (coordinator)', () => {
  it('12. coordinator reopens own closed session (closed_at back to null)', async () => {
    const client = await getClient(COORD_EMAIL);

    // Close it first (as the coordinator).
    const close = await client
      .from('class_sessions')
      .update({ closed_at: new Date().toISOString(), closed_by: fixtures.coordId })
      .eq('id', fixtures.sessionMainId)
      .select('id')
      .single();
    expect(close.error).toBeNull();

    // Reopen.
    const reopen = await client
      .from('class_sessions')
      .update({ closed_at: null, closed_by: null })
      .eq('id', fixtures.sessionMainId)
      .select('id, closed_at')
      .single();
    expect(reopen.error).toBeNull();
    expect(reopen.data?.closed_at).toBeNull();
  });
});

describe('Sprint 2 RLS — closeDay (coordinator, date + school scoped)', () => {
  it('13. closes today\'s open sessions of own school only — not other school, not other days', async () => {
    const client = await getClient(COORD_EMAIL);

    // Make sure the three sessions under test start OPEN.
    await admin
      .from('class_sessions')
      .update({ closed_at: null, closed_by: null })
      .in('id', [
        fixtures.sessionMainId,
        fixtures.sessionOtherId,
        fixtures.sessionMainPastId,
      ]);

    // The exact operation closeDay performs: update today's open sessions.
    const { start, end } = panamaTodayRange();
    const { error } = await client
      .from('class_sessions')
      .update({ closed_at: new Date().toISOString(), closed_by: fixtures.coordId })
      .gte('scheduled_start_at', start.toISOString())
      .lt('scheduled_start_at', end.toISOString())
      .is('closed_at', null);
    expect(error).toBeNull();

    // 1. today + own school (A) → CLOSED.
    const { data: a } = await admin
      .from('class_sessions')
      .select('closed_at')
      .eq('id', fixtures.sessionMainId)
      .single();
    expect(a?.closed_at).not.toBeNull();

    // 2. today + other school (B) → UNTOUCHED (blocked by RLS).
    const { data: b } = await admin
      .from('class_sessions')
      .select('closed_at')
      .eq('id', fixtures.sessionOtherId)
      .single();
    expect(b?.closed_at).toBeNull();

    // 3. other day + own school (A) → UNTOUCHED (date filter scopes to today).
    const { data: c } = await admin
      .from('class_sessions')
      .select('closed_at')
      .eq('id', fixtures.sessionMainPastId)
      .single();
    expect(c?.closed_at).toBeNull();
  });
});
