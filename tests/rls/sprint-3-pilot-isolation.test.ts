// Sprint 3 Tarea 7 — RLS isolation test for the CIDMI pilot data.
//
// El piloto metió data real de menores en prod: 162 students, 172 enrollments,
// 10 actividades activas y 72 class_sessions de CIDMI. Este archivo prueba que
// nadie de afuera la ve:
//
//   (a) Un coordinator de OTRA escuela NO ve ninguna actividad de CIDMI.
//   (b) ...ni ninguna de sus class_sessions.
//   (c) ...ni ninguno de sus students.
//   (d) Un parent NO ve students ajenos — sólo sus propios hijos.
//   (e) CONTROL POSITIVO: ese mismo coordinator SÍ ve lo de su propia escuela.
//       Sin este caso, el archivo pasaría igual si el cliente estuviera roto o
//       sin sesión (todo devuelve 0 filas y los 4 primeros tests quedan verdes
//       por el motivo equivocado).
//
// CIDMI es la única school real en prod, así que la "otra escuela" se crea acá
// con prefijo __rlstest_ (sprint brief, Tarea 7).
//
// Fixture strategy (AGENTS.md §9):
//   - Sub-prefijo propio __rlstest_s3iso_ en todo identificador, para que el
//     cleanup de este archivo no pise a los otros archivos RLS.
//   - Test users dedicados __rlstest_s3iso_*@portesco-test.com — NUNCA
//     Kassandra ni Alexander (PRD §6.6, higiene de la métrica de adopción).
//   - Un cliente firmado cacheado por rol (no signInAsUser por `it`, que pega
//     contra el rate limit de verifyOtp de GoTrue).
//   - Teardown FK-safe, sin asumir cascade.
//   - La data de CIDMI se LEE con admin sólo como referencia. Este archivo
//     nunca escribe una fila en CIDMI: si lo hiciera, contaminaría el piloto.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, signInAsUser } from '../_helpers/supabase';

const PREFIX = '__rlstest_s3iso_';
const COORD_OTHER_EMAIL = `${PREFIX}coordother@portesco-test.com`;
const PARENT_OTHER_EMAIL = `${PREFIX}parentother@portesco-test.com`;

const CIDMI_SLUG = 'cidmi';

type Fixtures = {
  coordOtherId: string;
  parentOtherId: string;
  otherSchoolId: string;
  otherActivityId: string;
  otherSessionId: string;
  otherStudentId: string;
  // Referencia de CIDMI, leída con admin.
  cidmiSchoolId: string;
  cidmiActivityIds: string[];
  cidmiActivityNames: string[];
  cidmiSessionIds: string[];
  cidmiStudentIds: string[];
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
  // Teardown FK-safe, scopeado al sub-prefijo. Orden:
  //   1. students prefijados (cascade enrollments)
  //   2. activities de las schools prefijadas — enrollments (RESTRICT) primero;
  //      class_sessions sí cascadean desde activities (0006)
  //   3. schools (ya sin hijos)
  //   4. auth users (cascade public.users + staff_schools + staff_activities)
  try {
    const { data } = await admin
      .from('students').select('id').like('full_name', `${PREFIX}%`);
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length) await admin.from('students').delete().in('id', ids);
  } catch { /* defensive */ }
  try {
    const { data: schools } = await admin
      .from('schools').select('id').like('name', `${PREFIX}%`);
    const schoolIds = (schools ?? []).map((r) => r.id as string);
    if (schoolIds.length) {
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

beforeAll(async () => {
  await cleanupRows();

  // ── Referencia: la data real de CIDMI, leída con admin (nunca escrita) ──
  const { data: cidmi, error: eC } = await admin
    .from('schools').select('id').eq('slug', CIDMI_SLUG).single();
  if (eC || !cidmi) throw new Error(`no encuentro la school ${CIDMI_SLUG}: ${eC?.message}`);

  const { data: cidmiActs } = await admin
    .from('activities').select('id, name').eq('school_id', cidmi.id).eq('is_active', true);
  const cidmiActivityIds = (cidmiActs ?? []).map((r) => r.id as string);
  const cidmiActivityNames = (cidmiActs ?? []).map((r) => r.name as string);
  if (cidmiActivityIds.length === 0) {
    throw new Error('CIDMI no tiene actividades activas — el seed de Sprint 3 no corrió.');
  }

  const { data: cidmiSessions } = await admin
    .from('class_sessions').select('id').in('activity_id', cidmiActivityIds);
  const cidmiSessionIds = (cidmiSessions ?? []).map((r) => r.id as string);
  if (cidmiSessionIds.length === 0) {
    throw new Error('CIDMI no tiene class_sessions — la Tarea 5 no corrió.');
  }

  const { data: cidmiStudents } = await admin
    .from('students').select('id').eq('school_id', cidmi.id).limit(50);
  const cidmiStudentIds = (cidmiStudents ?? []).map((r) => r.id as string);

  // ── Fixture: la "otra escuela" ──
  const coordOtherId = await createAuthUser(COORD_OTHER_EMAIL);
  const parentOtherId = await createAuthUser(PARENT_OTHER_EMAIL);

  for (const [id, email, role] of [
    [coordOtherId, COORD_OTHER_EMAIL, 'coordinator'],
    [parentOtherId, PARENT_OTHER_EMAIL, 'parent'],
  ] as const) {
    const { error } = await admin.from('users').insert({
      id, email, role, full_name: `${PREFIX}${role}`, is_admin: false,
    });
    if (error) throw new Error(`insert users(${email}): ${error.message}`);
  }

  const { data: school, error: eS } = await admin
    .from('schools')
    .insert({ name: `${PREFIX}other_school`, slug: `${PREFIX}other_school` })
    .select('id').single();
  if (eS || !school) throw new Error(`insert school: ${eS?.message}`);

  const { error: eSS } = await admin.from('staff_schools').insert({
    user_id: coordOtherId, school_id: school.id, role: 'coordinator',
  });
  if (eSS) throw new Error(`staff_schools: ${eSS.message}`);

  // Actividad + sesión + student propios: son el control positivo (e).
  const { data: act, error: eA } = await admin
    .from('activities')
    .insert({
      school_id: school.id, name: `${PREFIX}other_activity`,
      category: 'deporte', monthly_price: 0,
    })
    .select('id').single();
  if (eA || !act) throw new Error(`insert activity: ${eA?.message}`);

  const { data: sess, error: eSe } = await admin
    .from('class_sessions')
    .insert({
      activity_id: act.id,
      scheduled_start_at: '2026-09-22T19:30:00Z',
      scheduled_end_at: '2026-09-22T21:00:00Z',
    })
    .select('id').single();
  if (eSe || !sess) throw new Error(`insert class_session: ${eSe?.message}`);

  const { data: stu, error: eStu } = await admin
    .from('students')
    .insert({
      school_id: school.id, parent_id: parentOtherId,
      full_name: `${PREFIX}Student Other`, grade: '9no',
    })
    .select('id').single();
  if (eStu || !stu) throw new Error(`insert student: ${eStu?.message}`);

  fx = {
    coordOtherId, parentOtherId,
    otherSchoolId: school.id,
    otherActivityId: act.id,
    otherSessionId: sess.id,
    otherStudentId: stu.id,
    cidmiSchoolId: cidmi.id,
    cidmiActivityIds, cidmiActivityNames, cidmiSessionIds, cidmiStudentIds,
  };
});

afterAll(async () => {
  clientByEmail.clear();
  await cleanupRows();
});

describe('RLS Sprint 3 — aislamiento de la data del piloto CIDMI', () => {
  it('(a) un coordinator de otra escuela NO ve ninguna actividad de CIDMI', async () => {
    const client = await getClient(COORD_OTHER_EMAIL);

    // Por id: pide explícitamente las de CIDMI y no debe recibir ninguna.
    const { data: byId, error: e1 } = await client
      .from('activities').select('id, name').in('id', fx.cidmiActivityIds);
    expect(e1).toBeNull();
    expect(byId ?? []).toHaveLength(0);

    // Por nombre: las 10 reales, en caso de que un refactor cambie los ids.
    const { data: byName, error: e2 } = await client
      .from('activities').select('id, name').in('name', fx.cidmiActivityNames);
    expect(e2).toBeNull();
    expect(byName ?? []).toHaveLength(0);

    // Y sin filtro: nada de lo que ve puede pertenecer a CIDMI.
    const { data: all } = await client.from('activities').select('id, school_id');
    expect((all ?? []).some((r) => r.school_id === fx.cidmiSchoolId)).toBe(false);
  });

  it('(b) ...ni ninguna class_session de CIDMI', async () => {
    const client = await getClient(COORD_OTHER_EMAIL);

    const { data: byId, error } = await client
      .from('class_sessions').select('id').in('id', fx.cidmiSessionIds);
    expect(error).toBeNull();
    expect(byId ?? []).toHaveLength(0);

    const { data: all } = await client.from('class_sessions').select('id, activity_id');
    const leaked = (all ?? []).filter((r) => fx.cidmiActivityIds.includes(r.activity_id as string));
    expect(leaked).toHaveLength(0);
  });

  it('(c) ...ni ningún student de CIDMI', async () => {
    const client = await getClient(COORD_OTHER_EMAIL);

    const { data: byId, error } = await client
      .from('students').select('id').in('id', fx.cidmiStudentIds);
    expect(error).toBeNull();
    expect(byId ?? []).toHaveLength(0);

    const { data: all } = await client.from('students').select('id, school_id');
    expect((all ?? []).some((r) => r.school_id === fx.cidmiSchoolId)).toBe(false);
  });

  it('(d) un parent NO ve students ajenos — sólo su propio hijo', async () => {
    const client = await getClient(PARENT_OTHER_EMAIL);

    const { data: all, error } = await client.from('students').select('id, school_id');
    expect(error).toBeNull();
    expect((all ?? []).map((r) => r.id)).toEqual([fx.otherStudentId]);

    // Explícito contra CIDMI: ni un niño del piloto.
    const { data: cidmiKids } = await client
      .from('students').select('id').in('id', fx.cidmiStudentIds);
    expect(cidmiKids ?? []).toHaveLength(0);
  });

  it('(e) CONTROL POSITIVO: ese coordinator SÍ ve su propia escuela', async () => {
    // Sin esto, (a)-(d) pasarían igual con un cliente roto o sin sesión.
    const client = await getClient(COORD_OTHER_EMAIL);

    const { data: act } = await client
      .from('activities').select('id').eq('id', fx.otherActivityId);
    expect((act ?? []).map((r) => r.id)).toEqual([fx.otherActivityId]);

    const { data: sess } = await client
      .from('class_sessions').select('id').eq('id', fx.otherSessionId);
    expect((sess ?? []).map((r) => r.id)).toEqual([fx.otherSessionId]);

    const { data: stu } = await client
      .from('students').select('id').eq('id', fx.otherStudentId);
    expect((stu ?? []).map((r) => r.id)).toEqual([fx.otherStudentId]);
  });
});
