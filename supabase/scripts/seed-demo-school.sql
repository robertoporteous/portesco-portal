-- supabase/scripts/seed-demo-school.sql
-- Sprint 4 — Preview Tech Week. T0: el Colegio Demo Portesco.
--
-- QUÉ HACE
--   Siembra un colegio FICTICIO, aislado de CIDMI, en el mismo proyecto:
--     1 school (slug 'demo') · 4 users (2 padres, 1 coordinadora, 1 profesor)
--     6 actividades · 4 estudiantes con nombres INVENTADOS · enrollments
--     class_sessions de 3 semanas atrás a 2 adelante · asistencia de las pasadas
--
--   Aislamiento (por qué un colegio aparte y no dentro de CIDMI): el scope de un
--   coordinator es la escuela entera (coordinator_session_ids(), 0006) y el de un
--   professor son sus staff_activities. demo-coord y demo-prof solo tienen filas
--   en el colegio demo, así que ningún rol demo ve un nombre real, y Kassandra
--   no ve nada demo (su staff_schools es solo CIDMI).
--
--   Nombres de estudiantes: inventados y verificados con 0 coincidencias contra
--   el roster real de CIDMI (apellidos Navarro / Iturralde, 30 sep 2026).
--
-- PRE-REQ: los 4 auth users existen →
--   node --env-file=.env.local supabase/scripts/create-demo-users.ts
--   El pre-flight aborta si falta alguno.
--
-- EJECUTAR EN: Supabase Studio SQL Editor (service_role bypassea RLS).
-- IDEMPOTENTE: re-run safe. Las sesiones dependen de la fecha de corrida: correr
--   de nuevo otro día AGREGA las sesiones nuevas de la ventana, marca asistencia
--   de las que ya pasaron y las cierra. No pisa asistencia existente (ON CONFLICT
--   DO NOTHING), pero SÍ cierra cualquier sesión demo pasada que haya quedado
--   abierta. Re-correr antes del demo del 11 oct para que "hoy" tenga clases.
--   Guards: schools.slug, users.id, staff_*, enrollments tienen unique →
--   ON CONFLICT. activities, students y class_sessions NO → WHERE NOT EXISTS
--   (AGENTS §9).
--
-- BORRAR: cleanup-demo-school.sql (borra exactamente esto, en orden FK-safe).

BEGIN;

-- ============================================================
-- 0. Pre-flight
-- ============================================================

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(e, ', ') INTO missing
  FROM unnest(array[
    'demo-padre@portesco-test.com',
    'demo-padre2@portesco-test.com',
    'demo-coord@portesco-test.com',
    'demo-prof@portesco-test.com'
  ]) AS e
  WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.email = e);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Pre-flight: faltan auth users: %. Corré primero '
      'node --env-file=.env.local supabase/scripts/create-demo-users.ts', missing;
  END IF;
END $$;

-- ============================================================
-- 1. School
-- ============================================================

INSERT INTO schools (name, slug, bank_account, yappy_handle, contact_phone, coordination_phone)
VALUES (
  'Colegio Demo Portesco',
  'demo',
  'Banco Demo · Cuenta de ahorros 04-000-000000-0 (ficticia)',
  '@PortescoDemo',
  '+507 6000-0000',
  '+507 6000-0001'
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 2. Users (mirror de auth.users) + staff
-- ============================================================

INSERT INTO users (id, email, full_name, role, is_admin, is_active)
SELECT au.id, u.email, u.full_name, u.role::user_role, false, true
FROM (VALUES
  ('demo-padre@portesco-test.com',  'Laura Navarro',    'parent'),
  ('demo-padre2@portesco-test.com', 'Andrés Iturralde', 'parent'),
  ('demo-coord@portesco-test.com',  'Paola Méndez',     'coordinator'),
  ('demo-prof@portesco-test.com',   'Carlos Ruiz',      'professor')
) AS u(email, full_name, role)
JOIN auth.users au ON au.email = u.email
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_schools (user_id, school_id, role)
SELECT u.id, sc.id, u.role
FROM users u
JOIN schools sc ON sc.slug = 'demo'
WHERE u.email IN ('demo-coord@portesco-test.com', 'demo-prof@portesco-test.com')
ON CONFLICT (user_id, school_id) DO NOTHING;

-- ============================================================
-- 3. Actividades — modelo deporte × nivel de CIDMI, lun-vie 2:30-4:00 PM
-- ============================================================
-- monthly_price = 0.00 igual que CIDMI (no es un precio real).

INSERT INTO activities (school_id, name, category, monthly_price, schedule, days_of_week, start_time, end_time)
SELECT sc.id, a.name, a.category::activity_category, 0.00, a.schedule, a.days, time '14:30', time '16:00'
FROM (VALUES
  ('Fútbol Primaria',       'deporte',   'Lunes y miércoles 2:30-4:00 PM', array['lunes', 'miercoles']),
  ('Fútbol Secundaria',     'deporte',   'Martes y jueves 2:30-4:00 PM',   array['martes', 'jueves']),
  ('Voleibol Primaria',     'deporte',   'Martes y jueves 2:30-4:00 PM',   array['martes', 'jueves']),
  ('Basketball Primaria',   'deporte',   'Lunes y miércoles 2:30-4:00 PM', array['lunes', 'miercoles']),
  ('Baile Urbano Primaria', 'arte',      'Martes y jueves 2:30-4:00 PM',   array['martes', 'jueves']),
  ('Ajedrez Primaria',      'academico', 'Viernes 2:30-4:00 PM',           array['viernes'])
) AS a(name, category, schedule, days)
JOIN schools sc ON sc.slug = 'demo'
-- Sin filtro is_active en el guard: no duplicar una actividad desactivada.
WHERE NOT EXISTS (
  SELECT 1 FROM activities x WHERE x.school_id = sc.id AND x.name = a.name
);

-- demo-prof enseña Fútbol Primaria y Voleibol Primaria (3 niños entre las dos).
INSERT INTO staff_activities (user_id, activity_id)
SELECT u.id, ac.id
FROM users u
JOIN schools sc ON sc.slug = 'demo'
JOIN activities ac ON ac.school_id = sc.id
  AND ac.name IN ('Fútbol Primaria', 'Voleibol Primaria')
WHERE u.email = 'demo-prof@portesco-test.com'
ON CONFLICT (user_id, activity_id) DO NOTHING;

-- ============================================================
-- 4. Estudiantes (nombres inventados) + enrollments
-- ============================================================
-- demo-padre:  Mateo (Fútbol Primaria, Ajedrez) · Sofía (Fútbol Secundaria) = 3
-- demo-padre2: Lucas (Fútbol, Voleibol, Basketball Primaria) · Valentina (Voleibol, Baile Urbano)
--   demo-padre2 existe para poder demostrar aislamiento entre padres.

INSERT INTO students (school_id, parent_id, full_name, grade)
SELECT sc.id, u.id, s.full_name, s.grade
FROM (VALUES
  ('demo-padre@portesco-test.com',  'Mateo Navarro',      '4to'),
  ('demo-padre@portesco-test.com',  'Sofía Navarro',      '8vo'),
  ('demo-padre2@portesco-test.com', 'Lucas Iturralde',    '5to'),
  ('demo-padre2@portesco-test.com', 'Valentina Iturralde','3ro')
) AS s(parent_email, full_name, grade)
JOIN users u ON u.email = s.parent_email
JOIN schools sc ON sc.slug = 'demo'
WHERE NOT EXISTS (
  SELECT 1 FROM students x WHERE x.school_id = sc.id AND x.full_name = s.full_name
);

INSERT INTO enrollments (student_id, activity_id, status)
SELECT st.id, ac.id, 'active'::enrollment_status
FROM (VALUES
  ('Mateo Navarro',       'Fútbol Primaria'),
  ('Mateo Navarro',       'Ajedrez Primaria'),
  ('Sofía Navarro',       'Fútbol Secundaria'),
  ('Lucas Iturralde',     'Fútbol Primaria'),
  ('Lucas Iturralde',     'Voleibol Primaria'),
  ('Lucas Iturralde',     'Basketball Primaria'),
  ('Valentina Iturralde', 'Voleibol Primaria'),
  ('Valentina Iturralde', 'Baile Urbano Primaria')
) AS e(student_name, activity_name)
JOIN schools sc ON sc.slug = 'demo'
JOIN students st ON st.school_id = sc.id AND st.full_name = e.student_name
JOIN activities ac ON ac.school_id = sc.id AND ac.name = e.activity_name
ON CONFLICT (student_id, activity_id) DO NOTHING;

-- ============================================================
-- 5. class_sessions — desde el lunes de hace 3 semanas, 6 semanas
-- ============================================================
-- Ventana relativa a la fecha de corrida (en Panamá): semanas -3..+2.
-- Mismo patrón que generate-class-sessions-sprint-3.sql: hora local de Panamá
-- convertida con AT TIME ZONE (UTC-5 fijo, 2:30 PM = 19:30Z).

WITH params AS (
  SELECT
    (date_trunc('week', (now() AT TIME ZONE 'America/Panama'))::date - 21) AS lunes_0,
    6 AS semanas
),
-- dia_offset desde el lunes: 0 lun · 1 mar · 2 mié · 3 jue · 4 vie
bloques(activity_name, dia_offset) AS (VALUES
  ('Fútbol Primaria',       0), ('Fútbol Primaria',       2),
  ('Basketball Primaria',   0), ('Basketball Primaria',   2),
  ('Fútbol Secundaria',     1), ('Fútbol Secundaria',     3),
  ('Voleibol Primaria',     1), ('Voleibol Primaria',     3),
  ('Baile Urbano Primaria', 1), ('Baile Urbano Primaria', 3),
  ('Ajedrez Primaria',      4)
),
sesiones AS (
  SELECT
    b.activity_name,
    ((p.lunes_0 + w.n * 7 + b.dia_offset) + time '14:30') AT TIME ZONE 'America/Panama' AS start_at,
    ((p.lunes_0 + w.n * 7 + b.dia_offset) + time '16:00') AT TIME ZONE 'America/Panama' AS end_at
  FROM bloques b
  CROSS JOIN params p
  CROSS JOIN LATERAL generate_series(0, p.semanas - 1) AS w(n)
)
INSERT INTO class_sessions (activity_id, scheduled_start_at, scheduled_end_at)
SELECT ac.id, s.start_at, s.end_at
FROM sesiones s
JOIN schools sc ON sc.slug = 'demo'
JOIN activities ac ON ac.school_id = sc.id AND ac.name = s.activity_name
WHERE NOT EXISTS (
  SELECT 1 FROM class_sessions cs
  WHERE cs.activity_id = ac.id AND cs.scheduled_start_at = s.start_at
);

-- ============================================================
-- 6. Asistencia de las sesiones ya terminadas + cierre
-- ============================================================
-- Status determinístico por (sesión, estudiante) con hashtext: re-correr da lo
-- mismo. ~85% present, ~7% absent, ~4% late, ~4% justified.
-- Marcado por demo-coord a los 10 min de empezada la clase.

INSERT INTO class_attendance (session_id, student_id, status, marked_at, marked_by)
SELECT
  cs.id,
  en.student_id,
  (CASE
     WHEN h.v < 85 THEN 'present'
     WHEN h.v < 92 THEN 'absent'
     WHEN h.v < 96 THEN 'late'
     ELSE 'justified'
   END)::attendance_status,
  cs.scheduled_start_at + interval '10 minutes',
  coord.id
FROM class_sessions cs
JOIN activities ac ON ac.id = cs.activity_id
JOIN schools sc ON sc.id = ac.school_id AND sc.slug = 'demo'
JOIN enrollments en ON en.activity_id = ac.id AND en.status = 'active'
JOIN users coord ON coord.email = 'demo-coord@portesco-test.com'
CROSS JOIN LATERAL (
  SELECT abs(hashtext(cs.id::text || en.student_id::text)) % 100 AS v
) h
WHERE cs.scheduled_end_at < now()
ON CONFLICT (session_id, student_id) DO NOTHING;

UPDATE class_sessions cs
SET closed_at = cs.scheduled_end_at + interval '15 minutes',
    closed_by = coord.id
FROM activities ac, schools sc, users coord
WHERE ac.id = cs.activity_id
  AND sc.id = ac.school_id AND sc.slug = 'demo'
  AND coord.email = 'demo-coord@portesco-test.com'
  AND cs.scheduled_end_at < now()
  AND cs.closed_at IS NULL;

-- ============================================================
-- 7. Verificación dura — rollback si algo no cuadra
-- ============================================================

DO $$
DECLARE
  demo_id   uuid;
  n_act     int;
  n_stu     int;
  n_enr     int;
  leak      int;
  tz_bad    int;
BEGIN
  SELECT id INTO demo_id FROM schools WHERE slug = 'demo';

  SELECT count(*) INTO n_act FROM activities WHERE school_id = demo_id;
  SELECT count(*) INTO n_stu FROM students   WHERE school_id = demo_id;
  SELECT count(*) INTO n_enr FROM enrollments e JOIN students s ON s.id = e.student_id
  WHERE s.school_id = demo_id;

  IF n_act <> 6 OR n_stu <> 4 OR n_enr <> 8 THEN
    RAISE EXCEPTION 'Verificación: actividades=% (6), estudiantes=% (4), enrollments=% (8). Rollback.',
      n_act, n_stu, n_enr;
  END IF;

  -- Aislamiento: ningún user demo tiene scope fuera del colegio demo, y ningún
  -- estudiante demo está inscrito en una actividad de otro colegio.
  SELECT
      (SELECT count(*) FROM staff_schools ss JOIN users u ON u.id = ss.user_id
        WHERE u.email LIKE 'demo-%@portesco-test.com' AND ss.school_id <> demo_id)
    + (SELECT count(*) FROM staff_activities sa JOIN users u ON u.id = sa.user_id
        JOIN activities ac ON ac.id = sa.activity_id
        WHERE u.email LIKE 'demo-%@portesco-test.com' AND ac.school_id <> demo_id)
    + (SELECT count(*) FROM enrollments e JOIN students s ON s.id = e.student_id
        JOIN activities ac ON ac.id = e.activity_id
        WHERE s.school_id = demo_id AND ac.school_id <> demo_id)
    + (SELECT count(*) FROM students s JOIN users u ON u.id = s.parent_id
        WHERE u.email LIKE 'demo-%@portesco-test.com' AND s.school_id <> demo_id)
  INTO leak;

  IF leak > 0 THEN
    RAISE EXCEPTION 'Verificación de aislamiento: % filas demo apuntan fuera del colegio demo. Rollback.', leak;
  END IF;

  -- Control TZ: toda sesión demo empieza a las 19:30Z (2:30 PM Panamá).
  SELECT count(*) INTO tz_bad
  FROM class_sessions cs JOIN activities ac ON ac.id = cs.activity_id
  WHERE ac.school_id = demo_id
    AND to_char(cs.scheduled_start_at AT TIME ZONE 'UTC', 'HH24:MI') <> '19:30';

  IF tz_bad > 0 THEN
    RAISE EXCEPTION 'Verificación de zona horaria: % sesiones demo no empiezan a las 19:30Z. Rollback.', tz_bad;
  END IF;
END $$;

-- ============================================================
-- 8. Reporte visible en Studio (solo renderiza el último statement)
-- ============================================================

WITH sc AS (SELECT id FROM schools WHERE slug = 'demo'),
ses AS (
  SELECT cs.* FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id JOIN sc ON sc.id = ac.school_id
),
att AS (
  SELECT ca.status FROM class_attendance ca JOIN ses ON ses.id = ca.session_id
),
lineas(ord, line) AS (
  SELECT 1, '=== SEED COLEGIO DEMO PORTESCO ==='
  UNION ALL SELECT 2, format('users demo: %s (esperado 4)',
    (SELECT count(*) FROM users WHERE email LIKE 'demo-%@portesco-test.com'))
  UNION ALL SELECT 3, format('actividades: %s · estudiantes: %s · enrollments: %s',
    (SELECT count(*) FROM activities WHERE school_id = (SELECT id FROM sc)),
    (SELECT count(*) FROM students   WHERE school_id = (SELECT id FROM sc)),
    (SELECT count(*) FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE s.school_id = (SELECT id FROM sc)))
  UNION ALL SELECT 4, format('sesiones: %s (cerradas %s, abiertas %s) · primera %s · última %s',
    (SELECT count(*) FROM ses),
    (SELECT count(*) FROM ses WHERE closed_at IS NOT NULL),
    (SELECT count(*) FROM ses WHERE closed_at IS NULL),
    (SELECT to_char(min(scheduled_start_at) AT TIME ZONE 'America/Panama', 'Dy DD Mon') FROM ses),
    (SELECT to_char(max(scheduled_start_at) AT TIME ZONE 'America/Panama', 'Dy DD Mon') FROM ses))
  UNION ALL SELECT 5, format('asistencia: %s filas · present %s%% · absent %s · late %s · justified %s',
    (SELECT count(*) FROM att),
    (SELECT round(100.0 * count(*) FILTER (WHERE status = 'present') / nullif(count(*), 0)) FROM att),
    (SELECT count(*) FROM att WHERE status = 'absent'),
    (SELECT count(*) FROM att WHERE status = 'late'),
    (SELECT count(*) FROM att WHERE status = 'justified'))
)
SELECT line AS reporte FROM lineas ORDER BY ord;

COMMIT;

-- End of seed-demo-school.sql
