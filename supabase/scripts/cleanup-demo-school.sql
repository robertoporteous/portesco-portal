-- supabase/scripts/cleanup-demo-school.sql
-- Sprint 4 — Preview Tech Week. Borra EXACTAMENTE lo que siembran
-- seed-demo-school.sql, seed-demo-feed.sql y create-demo-users.ts, y nada más.
--
-- ALCANCE: el colegio con slug 'demo' y todo lo que cuelga de él, más los 4
--   users demo por email EXACTO (no LIKE: un LIKE amplio podría alcanzar un user
--   que no sembramos). Nada de CIDMI entra en ningún WHERE.
--
-- ORDEN FK-SAFE (verificado contra las migraciones, AGENTS §9 — no asumir cascade):
--   1. class_observations de sesiones demo o con author demo
--        (author_id NO ACTION; cascadea mention_assignments → profile_observations,
--         y profile_observations.professor_id es NO ACTION → tiene que irse antes
--         que los users)
--   2. enrollments de estudiantes demo   (activity_id RESTRICT)
--   3. activities del colegio demo       (school_id RESTRICT; cascadea
--        class_sessions → class_attendance / class_eventualities, staff_activities,
--        internal_alerts, bi_weekly_reports)
--   4. students del colegio demo         (school_id y parent_id RESTRICT)
--   5. schools demo                      (cascadea staff_schools, internal_alerts)
--   6. auth.users demo                   (cascadea public.users, feedback_events;
--                                          audit_logs.user_id → SET NULL)
--   5a. events / news_items del colegio demo (school_id RESTRICT, 0010) van
--       antes que la school; su created_by es SET NULL.
--
-- EJECUTAR EN: Supabase Studio SQL Editor. Idempotente (segunda corrida = 0 filas).

BEGIN;

CREATE TEMP TABLE demo_users ON COMMIT DROP AS
SELECT id FROM auth.users
WHERE email IN (
  'demo-padre@portesco-test.com',
  'demo-padre2@portesco-test.com',
  'demo-coord@portesco-test.com',
  'demo-prof@portesco-test.com'
);

-- 1. Observaciones (voz/texto grabadas en el demo)
DELETE FROM class_observations co
WHERE co.author_id IN (SELECT id FROM demo_users)
   OR co.session_id IN (
     SELECT cs.id FROM class_sessions cs
     JOIN activities ac ON ac.id = cs.activity_id
     JOIN schools sc ON sc.id = ac.school_id
     WHERE sc.slug = 'demo'
   );

-- 2. Enrollments
DELETE FROM enrollments e
USING students s, schools sc
WHERE s.id = e.student_id AND sc.id = s.school_id AND sc.slug = 'demo';

-- 3. Actividades (+ sesiones, asistencia, eventualidades, staff_activities en cascada)
DELETE FROM activities ac
USING schools sc
WHERE sc.id = ac.school_id AND sc.slug = 'demo';

-- 4. Estudiantes
DELETE FROM students s
USING schools sc
WHERE sc.id = s.school_id AND sc.slug = 'demo';

-- 5a. Feed del colegio (0010: events/news_items.school_id RESTRICT).
--     Guard por si la 0010 todavía no está aplicada.
DO $$
BEGIN
  IF to_regclass('public.events') IS NOT NULL THEN
    DELETE FROM events WHERE school_id IN (SELECT id FROM schools WHERE slug = 'demo');
    DELETE FROM news_items WHERE school_id IN (SELECT id FROM schools WHERE slug = 'demo');
  END IF;
END $$;

-- 5b. Colegio
DELETE FROM schools WHERE slug = 'demo';

-- 6. Users (auth → public.users en cascada)
DELETE FROM auth.users WHERE id IN (SELECT id FROM demo_users);

-- Verificación: no queda nada demo.
DO $$
DECLARE
  restos int;
BEGIN
  SELECT
      (SELECT count(*) FROM schools WHERE slug = 'demo')
    + (SELECT count(*) FROM users WHERE email IN (
        'demo-padre@portesco-test.com', 'demo-padre2@portesco-test.com',
        'demo-coord@portesco-test.com', 'demo-prof@portesco-test.com'))
  INTO restos;
  IF restos > 0 THEN
    RAISE EXCEPTION 'Cleanup incompleto: % filas demo siguen ahí. Rollback.', restos;
  END IF;
END $$;

SELECT 'cleanup demo OK — colegio demo y 4 users demo borrados' AS reporte;

COMMIT;

-- End of cleanup-demo-school.sql
