// Sprint 4 T1 — RLS del lado padre (eje "mi hijo" + eje "mi colegio").
//
// Migración 0010 agrega 9 policies. Este archivo prueba las que dan visibilidad
// nueva al PARENT y que ninguna abre más de lo que debe:
//
//   (a) events: ve los PUBLICADOS de la escuela de su hijo; NO los no publicados
//       ni los de otra escuela.
//   (b) news_items: idem.
//   (c) class_sessions: ve las de las actividades donde su hijo está inscrito;
//       NO las de otra actividad de la misma escuela ni de otra escuela.
//   (d) class_attendance: ve SOLO las filas de su propio hijo, aunque otro
//       niño comparta la misma sesión.
//   (e) activities: ve el catálogo ACTIVO de la escuela de su hijo (incluida una
//       actividad donde NO está inscrito); NO las inactivas ni las de otra escuela.
//   (f) parent NO puede escribir en events ni en news_items.
//   (g) CONTROL POSITIVO: el parent de la escuela B ve lo de la escuela B.
//
// Fixture strategy (AGENTS.md §9): sub-prefijo __rlstest_s4par_, users dedicados,
// cliente firmado cacheado por rol, teardown FK-safe sin asumir cascade. Nunca
// toca CIDMI ni el colegio demo.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, signInAsUser } from '../_helpers/supabase';

const PREFIX = '__rlstest_s4par_';
const PARENT_A_EMAIL = `${PREFIX}parent_a@portesco-test.com`;
const PARENT_A2_EMAIL = `${PREFIX}parent_a2@portesco-test.com`; // otro padre, misma escuela
const PARENT_B_EMAIL = `${PREFIX}parent_b@portesco-test.com`;
const COORD_A_EMAIL = `${PREFIX}coord_a@portesco-test.com`;

type Fixtures = {
  parentAId: string; parentA2Id: string; parentBId: string; coordAId: string;
  schoolAId: string; schoolBId: string;
  actA1Id: string;      // enrolled (student A)
  actA2Id: string;      // activa, sin inscripción de A
  actA3Id: string;      // inactiva
  actB1Id: string;
  studentAId: string; studentA2Id: string; studentBId: string;
  sessA1Id: string; sessA2Id: string; sessB1Id: string;
  attAId: string; attA2Id: string;   // ambas en sessA1
  evAPubId: string; evAUnpubId: string; evBId: string;
  newsAId: string; newsAUnpubId: string; newsBId: string;
};

let fx: Fixtures;
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
  // Orden FK-safe (0001/0006/0010): events/news_items (school RESTRICT) →
  // attendance (cascade por session, pero borramos explícito) → students
  // (cascade enrollments) → activities de las schools prefijadas (sessions
  // cascadean) → schools → auth users (cascade public.users + staff_*).
  try {
    const { data: schools } = await admin
      .from('schools').select('id').like('name', `${PREFIX}%`);
    const schoolIds = (schools ?? []).map((r) => r.id as string);
    if (schoolIds.length) {
      await admin.from('events').delete().in('school_id', schoolIds);
      await admin.from('news_items').delete().in('school_id', schoolIds);
      const { data: stus } = await admin
        .from('students').select('id').in('school_id', schoolIds);
      const stuIds = (stus ?? []).map((r) => r.id as string);
      if (stuIds.length) {
        await admin.from('class_attendance').delete().in('student_id', stuIds);
        await admin.from('students').delete().in('id', stuIds);
      }
      const { data: acts } = await admin
        .from('activities').select('id').in('school_id', schoolIds);
      const actIds = (acts ?? []).map((r) => r.id as string);
      if (actIds.length) {
        await admin.from('enrollments').delete().in('activity_id', actIds);
        await admin.from('activities').delete().in('id', actIds);
      }
      await admin.from('schools').delete().in('id', schoolIds);
    }
  } catch { /* defensive */ }
  try {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of (list?.users ?? []).filter((x) => (x.email ?? '').startsWith(PREFIX))) {
      await admin.auth.admin.deleteUser(u.id);
    }
  } catch { /* defensive */ }
}

async function createAuthUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser(${email}): ${error?.message ?? 'no user'}`);
  return data.user.id;
}

async function insertOne<T extends Record<string, unknown>>(
  table: string, row: T, label: string,
): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select('id').single();
  if (error || !data) throw new Error(`insert ${label}: ${error?.message ?? 'no row'}`);
  return data.id as string;
}

beforeAll(async () => {
  await cleanupRows();

  const parentAId = await createAuthUser(PARENT_A_EMAIL);
  const parentA2Id = await createAuthUser(PARENT_A2_EMAIL);
  const parentBId = await createAuthUser(PARENT_B_EMAIL);
  const coordAId = await createAuthUser(COORD_A_EMAIL);

  for (const [id, email, role] of [
    [parentAId, PARENT_A_EMAIL, 'parent'],
    [parentA2Id, PARENT_A2_EMAIL, 'parent'],
    [parentBId, PARENT_B_EMAIL, 'parent'],
    [coordAId, COORD_A_EMAIL, 'coordinator'],
  ] as const) {
    const { error } = await admin.from('users').insert({
      id, email, role, full_name: `${PREFIX}${role}`, is_admin: false,
    });
    if (error) throw new Error(`insert users(${email}): ${error.message}`);
  }

  const schoolAId = await insertOne('schools',
    { name: `${PREFIX}school_a`, slug: `${PREFIX}school_a` }, 'school A');
  const schoolBId = await insertOne('schools',
    { name: `${PREFIX}school_b`, slug: `${PREFIX}school_b` }, 'school B');

  const { error: eSS } = await admin.from('staff_schools').insert({
    user_id: coordAId, school_id: schoolAId, role: 'coordinator',
  });
  if (eSS) throw new Error(`staff_schools: ${eSS.message}`);

  const act = (school_id: string, name: string, is_active = true) =>
    insertOne('activities',
      { school_id, name: `${PREFIX}${name}`, category: 'deporte', monthly_price: 0, is_active },
      name);
  const actA1Id = await act(schoolAId, 'a1_enrolled');
  const actA2Id = await act(schoolAId, 'a2_catalog');
  const actA3Id = await act(schoolAId, 'a3_inactive', false);
  const actB1Id = await act(schoolBId, 'b1');

  const stu = (school_id: string, parent_id: string, name: string) =>
    insertOne('students',
      { school_id, parent_id, full_name: `${PREFIX}${name}`, grade: '5to' }, name);
  const studentAId = await stu(schoolAId, parentAId, 'student_a');
  const studentA2Id = await stu(schoolAId, parentA2Id, 'student_a2');
  const studentBId = await stu(schoolBId, parentBId, 'student_b');

  for (const [student_id, activity_id] of [
    [studentAId, actA1Id], [studentA2Id, actA1Id], [studentBId, actB1Id],
  ]) {
    const { error } = await admin.from('enrollments')
      .insert({ student_id, activity_id, status: 'active' });
    if (error) throw new Error(`enrollment: ${error.message}`);
  }

  const sess = (activity_id: string, day: string) =>
    insertOne('class_sessions',
      { activity_id, scheduled_start_at: `${day}T19:30:00Z`, scheduled_end_at: `${day}T21:00:00Z` },
      `session ${activity_id}`);
  const sessA1Id = await sess(actA1Id, '2026-09-21');
  const sessA2Id = await sess(actA2Id, '2026-09-22');
  const sessB1Id = await sess(actB1Id, '2026-09-23');

  const attAId = await insertOne('class_attendance',
    { session_id: sessA1Id, student_id: studentAId, status: 'present', marked_by: coordAId },
    'attendance A');
  const attA2Id = await insertOne('class_attendance',
    { session_id: sessA1Id, student_id: studentA2Id, status: 'absent', marked_by: coordAId },
    'attendance A2');

  const ev = (school_id: string, title: string, is_published: boolean) =>
    insertOne('events',
      { school_id, title: `${PREFIX}${title}`, event_type: 'match',
        starts_at: '2026-10-10T19:30:00Z', is_published },
      title);
  const evAPubId = await ev(schoolAId, 'ev_a_pub', true);
  const evAUnpubId = await ev(schoolAId, 'ev_a_unpub', false);
  const evBId = await ev(schoolBId, 'ev_b', true);

  const news = (school_id: string, title: string, is_published: boolean) =>
    insertOne('news_items',
      { school_id, title: `${PREFIX}${title}`, kind: 'announcement', body: 'x', is_published },
      title);
  const newsAId = await news(schoolAId, 'news_a', true);
  const newsAUnpubId = await news(schoolAId, 'news_a_unpub', false);
  const newsBId = await news(schoolBId, 'news_b', true);

  fx = {
    parentAId, parentA2Id, parentBId, coordAId,
    schoolAId, schoolBId,
    actA1Id, actA2Id, actA3Id, actB1Id,
    studentAId, studentA2Id, studentBId,
    sessA1Id, sessA2Id, sessB1Id,
    attAId, attA2Id,
    evAPubId, evAUnpubId, evBId,
    newsAId, newsAUnpubId, newsBId,
  };
});

afterAll(async () => {
  clientByEmail.clear();
  await cleanupRows();
});

const ids = (rows: { id: string }[] | null | undefined) => (rows ?? []).map((r) => r.id).sort();

describe('RLS Sprint 4 — lectura del padre (0010)', () => {
  it('(a) events: solo los publicados de la escuela de su hijo', async () => {
    const client = await getClient(PARENT_A_EMAIL);
    const { data, error } = await client
      .from('events').select('id').in('id', [fx.evAPubId, fx.evAUnpubId, fx.evBId]);
    expect(error).toBeNull();
    expect(ids(data)).toEqual([fx.evAPubId]);
  });

  it('(b) news_items: solo las publicadas de la escuela de su hijo', async () => {
    const client = await getClient(PARENT_A_EMAIL);
    const { data, error } = await client
      .from('news_items').select('id').in('id', [fx.newsAId, fx.newsAUnpubId, fx.newsBId]);
    expect(error).toBeNull();
    expect(ids(data)).toEqual([fx.newsAId]);
  });

  it('(c) class_sessions: solo las de actividades donde su hijo está inscrito', async () => {
    const client = await getClient(PARENT_A_EMAIL);
    const { data, error } = await client
      .from('class_sessions').select('id').in('id', [fx.sessA1Id, fx.sessA2Id, fx.sessB1Id]);
    expect(error).toBeNull();
    expect(ids(data)).toEqual([fx.sessA1Id]);
  });

  it('(d) class_attendance: solo las filas de su propio hijo, aunque otro niño comparta sesión', async () => {
    const client = await getClient(PARENT_A_EMAIL);
    const { data, error } = await client
      .from('class_attendance').select('id, student_id').eq('session_id', fx.sessA1Id);
    expect(error).toBeNull();
    expect(ids(data)).toEqual([fx.attAId]);
    expect((data ?? []).every((r) => r.student_id === fx.studentAId)).toBe(true);
  });

  it('(e) activities: catálogo activo de la escuela de su hijo, sin inactivas ni de otra escuela', async () => {
    const client = await getClient(PARENT_A_EMAIL);
    const { data, error } = await client
      .from('activities').select('id').in('id', [fx.actA1Id, fx.actA2Id, fx.actA3Id, fx.actB1Id]);
    expect(error).toBeNull();
    expect(ids(data)).toEqual([fx.actA1Id, fx.actA2Id].sort());
  });

  it('(f) parent NO puede escribir en events ni news_items', async () => {
    const client = await getClient(PARENT_A_EMAIL);
    const { error: e1 } = await client.from('events').insert({
      school_id: fx.schoolAId, title: `${PREFIX}hack`, event_type: 'other',
      starts_at: '2026-10-10T19:30:00Z',
    });
    expect(e1).not.toBeNull();
    const { error: e2 } = await client.from('news_items').insert({
      school_id: fx.schoolAId, title: `${PREFIX}hack`, kind: 'announcement',
    });
    expect(e2).not.toBeNull();
    // Y no quedó nada escrito.
    const { data: leftover } = await admin
      .from('events').select('id').eq('title', `${PREFIX}hack`);
    expect(leftover ?? []).toHaveLength(0);
  });

  it('(g) CONTROL POSITIVO: el padre de la escuela B ve lo de la escuela B', async () => {
    const client = await getClient(PARENT_B_EMAIL);
    const { data: ev } = await client.from('events').select('id').eq('id', fx.evBId);
    expect(ids(ev)).toEqual([fx.evBId]);
    const { data: nw } = await client.from('news_items').select('id').eq('id', fx.newsBId);
    expect(ids(nw)).toEqual([fx.newsBId]);
    const { data: ss } = await client.from('class_sessions').select('id').eq('id', fx.sessB1Id);
    expect(ids(ss)).toEqual([fx.sessB1Id]);
    const { data: act } = await client.from('activities').select('id').eq('id', fx.actB1Id);
    expect(ids(act)).toEqual([fx.actB1Id]);
  });
});
