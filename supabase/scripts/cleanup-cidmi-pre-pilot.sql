-- supabase/scripts/cleanup-cidmi-pre-pilot.sql
-- Sprint 3 — Tarea 2 · Limpieza de data de PRUEBA de CIDMI antes del piloto
--
-- OBJETIVO:
--   Dejar CIDMI en cero de asistencia para que el día 1 de Kassandra arranque
--   limpio (PRD §6: "ni una fila de asistencia creada por nosotros"). Borra el
--   calendario de sesiones de prueba de junio-julio 2026, su asistencia y sus
--   eventualidades. NO toca data real ni la voz de Bloque 3/4.
--
-- QUÉ SE BORRA:
--   - class_attendance de sesiones de CIDMI            (inventario 10 sep: 7 filas)
--   - class_eventualities de sesiones de CIDMI         (inventario: 1 fila)
--   - internal_alerts type='consecutive_absence' CIDMI (inventario: 0 filas)
--   - class_sessions de CIDMI SIN observaciones colgadas (inventario: 7 de 8)
--
-- QUÉ NO SE BORRA (explícito):
--   - students, enrollments, users, staff_schools, staff_activities
--   - _pilot_parent_contacts, audit_logs
--   - class_observations, mention_assignments, profile_observations, student_profiles
--   - la sesión 51ba752e-15c9-4d7c-9a1b-d4791e0062c5 → tiene 5 class_observations
--     colgadas (1 pending_extraction, 3 pending_confirmation, 1 confirmed: la
--     corrida golden 80234aad de cierre de Bloque 3) y 6 mention_assignments
--     derivadas. class_observations.session_id es ON DELETE CASCADE (0006:190):
--     borrar la sesión las destruiría en silencio. Se CIERRA en vez de borrarse,
--     para que no cuelgue como sesión abierta en ninguna vista del Pad.
--     Su limpieza real es de Bloque 4 (docs/IMPLEMENTATION_STATUS.md).
--
-- ACTIVIDADES DEMO (seed 0003, 06 may 2026): Atletismo, Fútbol, Ajedrez,
--   Basketball → is_active = false. Sus 4 enrollments y los 2 students demo
--   se quedan intactos (sin sesiones no aparecen en el Pad).
--   OJO: el filtro es por id + name exactos. NUNCA puede tocar las 13
--   actividades nuevas de Tarea 3 ("Ajedrez Primaria", "Basketball Primaria"...).
--
-- RESPALDO: tres tablas _backup_sprint3_* en public, pobladas ANTES de cada
--   DELETE, con RLS ENABLED y SIN políticas → deny-all para anon/authenticated
--   (service_role bypassea). Es asistencia de menores: una tabla nueva en public
--   sin RLS queda expuesta por PostgREST. Restore + DROP al final, comentados.
--
-- NO es migración: no cambia el schema del producto. Se aplica MANUAL en
--   Supabase Studio SQL Editor (service_role bypass RLS), igual que los seeds
--   de Sprint 2.
--
-- IDEMPOTENTE: re-run safe. Los backups usan WHERE NOT EXISTS por id, así que
--   una segunda corrida no los vacía ni los duplica. Todo el script va en una
--   transacción con asserts al final: si algo no cuadra, RAISE → ROLLBACK total.

BEGIN;

-- ============================================================
-- 0. Pre-flight
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schools WHERE slug = 'cidmi') THEN
    RAISE EXCEPTION 'Cleanup precondition failed: school slug=cidmi no existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = 'f991e59b-66ff-45f7-8e94-1c532b7937d6' AND is_admin = true
  ) THEN
    RAISE EXCEPTION
      'Cleanup precondition failed: el admin f991e59b (Roberto) no existe o no es is_admin. '
      'Se usa como closed_by de la sesión con observaciones.';
  END IF;
END $$;

-- ============================================================
-- 1. Conteos ANTES
-- ============================================================

DO $$
DECLARE
  n_sessions int; n_closed int; n_att int; n_evt int; n_alerts int;
  n_obs int; n_sess_con_obs int; n_demo_activas int;
BEGIN
  SELECT count(*) INTO n_sessions
    FROM class_sessions cs JOIN activities a ON a.id = cs.activity_id
    JOIN schools s ON s.id = a.school_id WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_closed
    FROM class_sessions cs JOIN activities a ON a.id = cs.activity_id
    JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi' AND cs.closed_at IS NOT NULL;

  SELECT count(*) INTO n_att
    FROM class_attendance ca JOIN class_sessions cs ON cs.id = ca.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_evt
    FROM class_eventualities ce JOIN class_sessions cs ON cs.id = ce.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_alerts
    FROM internal_alerts ia JOIN schools s ON s.id = ia.school_id
    WHERE s.slug = 'cidmi' AND ia.type = 'consecutive_absence';

  SELECT count(*) INTO n_obs
    FROM class_observations co JOIN class_sessions cs ON cs.id = co.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(DISTINCT co.session_id) INTO n_sess_con_obs
    FROM class_observations co JOIN class_sessions cs ON cs.id = co.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_demo_activas
    FROM activities a JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi' AND a.is_active = true
      AND a.id IN ('0fa0a87f-2d5c-4869-888e-539d8b12dd39',
                   '03121d88-f242-4841-a4f5-1061968e9200',
                   '7c8dd158-6709-4a6d-9b35-0348af1a47d5',
                   'e84998b7-6776-43e9-abfa-d47b4e2cc6fa');

  RAISE NOTICE '--- ANTES ---';
  RAISE NOTICE 'class_sessions=%  (closed=%)', n_sessions, n_closed;
  RAISE NOTICE 'class_attendance=%  class_eventualities=%', n_att, n_evt;
  RAISE NOTICE 'internal_alerts(consecutive_absence)=%', n_alerts;
  RAISE NOTICE 'class_observations=%  en % sesion(es) [SE PRESERVAN]', n_obs, n_sess_con_obs;
  RAISE NOTICE 'actividades demo aun activas=%', n_demo_activas;
  RAISE NOTICE 'Esperado en la 1a corrida: 8 (1) / 7 / 1 / 0 / 5 en 1 / 4';
END $$;

-- ============================================================
-- 2. Respaldo (ANTES de cualquier DELETE)
-- ============================================================
-- LIKE sin INCLUDING DEFAULTS: misma forma de columnas, sin PK ni índices.
-- El INSERT ... SELECT * de restore funciona 1:1 porque el orden coincide.

CREATE TABLE IF NOT EXISTS _backup_sprint3_class_sessions      (LIKE public.class_sessions);
CREATE TABLE IF NOT EXISTS _backup_sprint3_class_attendance    (LIKE public.class_attendance);
CREATE TABLE IF NOT EXISTS _backup_sprint3_class_eventualities (LIKE public.class_eventualities);

-- Deny-all. RLS habilitada SIN políticas + REVOKE del grant de PostgREST.
-- service_role bypassea RLS, así que el restore de abajo sigue funcionando.
ALTER TABLE _backup_sprint3_class_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE _backup_sprint3_class_attendance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE _backup_sprint3_class_eventualities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON _backup_sprint3_class_sessions      FROM anon, authenticated;
REVOKE ALL ON _backup_sprint3_class_attendance    FROM anon, authenticated;
REVOKE ALL ON _backup_sprint3_class_eventualities FROM anon, authenticated;

-- Backup de TODAS las sesiones de CIDMI (incluida la que se preserva: si mañana
-- hay que reconstruir el estado del 10 sep, quiero la foto completa).
INSERT INTO _backup_sprint3_class_sessions
SELECT cs.*
FROM class_sessions cs
JOIN activities a ON a.id = cs.activity_id
JOIN schools s ON s.id = a.school_id
WHERE s.slug = 'cidmi'
  AND NOT EXISTS (SELECT 1 FROM _backup_sprint3_class_sessions b WHERE b.id = cs.id);

INSERT INTO _backup_sprint3_class_attendance
SELECT ca.*
FROM class_attendance ca
JOIN class_sessions cs ON cs.id = ca.session_id
JOIN activities a ON a.id = cs.activity_id
JOIN schools s ON s.id = a.school_id
WHERE s.slug = 'cidmi'
  AND NOT EXISTS (SELECT 1 FROM _backup_sprint3_class_attendance b WHERE b.id = ca.id);

INSERT INTO _backup_sprint3_class_eventualities
SELECT ce.*
FROM class_eventualities ce
JOIN class_sessions cs ON cs.id = ce.session_id
JOIN activities a ON a.id = cs.activity_id
JOIN schools s ON s.id = a.school_id
WHERE s.slug = 'cidmi'
  AND NOT EXISTS (SELECT 1 FROM _backup_sprint3_class_eventualities b WHERE b.id = ce.id);

DO $$
DECLARE b_sess int; b_att int; b_evt int;
BEGIN
  SELECT count(*) INTO b_sess FROM _backup_sprint3_class_sessions;
  SELECT count(*) INTO b_att  FROM _backup_sprint3_class_attendance;
  SELECT count(*) INTO b_evt  FROM _backup_sprint3_class_eventualities;
  RAISE NOTICE '--- BACKUP ---  sessions=%  attendance=%  eventualities=%', b_sess, b_att, b_evt;
  IF b_sess < 8 OR b_att < 7 OR b_evt < 1 THEN
    RAISE EXCEPTION 'Backup incompleto (sessions=% att=% evt=%). Abortando antes de borrar nada.',
      b_sess, b_att, b_evt;
  END IF;
END $$;

-- ============================================================
-- 3. Cerrar la sesión que se preserva (la que tiene observaciones)
-- ============================================================
-- Triggers sobre class_sessions: solo class_sessions_set_updated_at (0006:128),
-- BEFORE UPDATE → set_updated_at(). Ningún trigger toca class_observations.
-- Verificado en las 4 migraciones que crean triggers (0001/0006/0007).

UPDATE class_sessions cs
SET closed_at = now(),
    closed_by = 'f991e59b-66ff-45f7-8e94-1c532b7937d6'  -- Roberto (is_admin)
FROM activities a, schools s
WHERE a.id = cs.activity_id
  AND s.id = a.school_id
  AND s.slug = 'cidmi'
  AND cs.closed_at IS NULL
  AND EXISTS (SELECT 1 FROM class_observations co WHERE co.session_id = cs.id);

-- ============================================================
-- 4. DELETE — hijos primero (AGENTS.md §9: nunca asumir cascade)
-- ============================================================
-- class_attendance y class_eventualities cascadearían con la sesión, pero se
-- borran explícito para tener conteo propio y para vaciar también la sesión
-- preservada (hoy tiene 0 de cada una).
-- class_attendance_consecutive_absence es AFTER INSERT OR UPDATE (0006:538):
-- un DELETE no lo dispara, no se generan alertas nuevas.

DELETE FROM class_attendance ca
USING class_sessions cs, activities a, schools s
WHERE cs.id = ca.session_id AND a.id = cs.activity_id AND s.id = a.school_id
  AND s.slug = 'cidmi';

DELETE FROM class_eventualities ce
USING class_sessions cs, activities a, schools s
WHERE cs.id = ce.session_id AND a.id = cs.activity_id AND s.id = a.school_id
  AND s.slug = 'cidmi';

DELETE FROM internal_alerts ia
USING schools s
WHERE s.id = ia.school_id AND s.slug = 'cidmi'
  AND ia.type = 'consecutive_absence';

-- Auto-protegida: la condición NOT EXISTS deja fuera cualquier sesión con
-- observaciones, hoy y en el futuro. No hay lista de ids hardcodeada.
DELETE FROM class_sessions cs
USING activities a, schools s
WHERE a.id = cs.activity_id AND s.id = a.school_id
  AND s.slug = 'cidmi'
  AND NOT EXISTS (SELECT 1 FROM class_observations co WHERE co.session_id = cs.id);

-- ============================================================
-- 5. Actividades demo del seed 0003 → inactivas
-- ============================================================
-- Doble filtro id + name: imposible que alcance a las 13 de Tarea 3.

UPDATE activities a
SET is_active = false
FROM schools s
WHERE s.id = a.school_id
  AND s.slug = 'cidmi'
  AND a.is_active = true
  AND a.id IN ('0fa0a87f-2d5c-4869-888e-539d8b12dd39',   -- Atletismo
               '03121d88-f242-4841-a4f5-1061968e9200',   -- Fútbol
               '7c8dd158-6709-4a6d-9b35-0348af1a47d5',   -- Ajedrez
               'e84998b7-6776-43e9-abfa-d47b4e2cc6fa')   -- Basketball
  AND a.name IN ('Atletismo', 'Fútbol', 'Ajedrez', 'Basketball');

-- ============================================================
-- 6. Conteos DESPUÉS + asserts (fallan → ROLLBACK de todo)
-- ============================================================

DO $$
DECLARE
  n_sessions int; n_open int; n_att int; n_evt int; n_alerts int;
  n_obs int; n_mentions int; n_students int; n_enroll int;
  n_demo_activas int; n_futbol_sec int;
BEGIN
  SELECT count(*) INTO n_sessions
    FROM class_sessions cs JOIN activities a ON a.id = cs.activity_id
    JOIN schools s ON s.id = a.school_id WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_open
    FROM class_sessions cs JOIN activities a ON a.id = cs.activity_id
    JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi' AND cs.closed_at IS NULL;

  SELECT count(*) INTO n_att
    FROM class_attendance ca JOIN class_sessions cs ON cs.id = ca.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_evt
    FROM class_eventualities ce JOIN class_sessions cs ON cs.id = ce.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_alerts
    FROM internal_alerts ia JOIN schools s ON s.id = ia.school_id WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_obs
    FROM class_observations co JOIN class_sessions cs ON cs.id = co.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_mentions
    FROM mention_assignments ma
    JOIN class_observations co ON co.id = ma.observation_id
    JOIN class_sessions cs ON cs.id = co.session_id
    JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_students
    FROM students st JOIN schools s ON s.id = st.school_id WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_enroll
    FROM enrollments e JOIN activities a ON a.id = e.activity_id
    JOIN schools s ON s.id = a.school_id WHERE s.slug = 'cidmi';

  SELECT count(*) INTO n_demo_activas
    FROM activities a JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi' AND a.is_active = true
      AND a.id IN ('0fa0a87f-2d5c-4869-888e-539d8b12dd39',
                   '03121d88-f242-4841-a4f5-1061968e9200',
                   '7c8dd158-6709-4a6d-9b35-0348af1a47d5',
                   'e84998b7-6776-43e9-abfa-d47b4e2cc6fa');

  SELECT count(*) INTO n_futbol_sec
    FROM enrollments e JOIN activities a ON a.id = e.activity_id
    JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi' AND a.name = 'Fútbol U14-U18';

  RAISE NOTICE '--- DESPUES ---';
  RAISE NOTICE 'class_sessions=%  (abiertas=%)', n_sessions, n_open;
  RAISE NOTICE 'class_attendance=%  class_eventualities=%  internal_alerts=%', n_att, n_evt, n_alerts;
  RAISE NOTICE 'class_observations=%  mention_assignments=%  [PRESERVADAS]', n_obs, n_mentions;
  RAISE NOTICE 'students=%  enrollments=%  (Futbol U14-U18=%)', n_students, n_enroll, n_futbol_sec;
  RAISE NOTICE 'actividades demo activas=%', n_demo_activas;
  RAISE NOTICE 'Esperado: 1 (0) / 0 / 0 / 0 / 5 / 6 / 38 / 40 (36) / 0';

  -- Asserts duros
  IF n_att <> 0 OR n_evt <> 0 THEN
    RAISE EXCEPTION 'Assert fallido: quedan filas de asistencia (att=% evt=%). El dia 1 debe arrancar en cero.', n_att, n_evt;
  END IF;
  IF n_open <> 0 THEN
    RAISE EXCEPTION 'Assert fallido: quedan % sesiones abiertas en CIDMI.', n_open;
  END IF;
  IF n_obs <> 5 OR n_mentions <> 6 THEN
    RAISE EXCEPTION 'Assert fallido: se perdieron observaciones de voz (obs=% esperado 5, mentions=% esperado 6). ROLLBACK.', n_obs, n_mentions;
  END IF;
  IF n_students <> 38 OR n_enroll <> 40 OR n_futbol_sec <> 36 THEN
    RAISE EXCEPTION 'Assert fallido: se toco data real (students=% enrollments=% futbol=%). ROLLBACK.', n_students, n_enroll, n_futbol_sec;
  END IF;
  IF n_demo_activas <> 0 THEN
    RAISE EXCEPTION 'Assert fallido: quedan % actividades demo activas.', n_demo_activas;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- 7. Verificación post-commit (result set, no NOTICE)
-- ============================================================

SELECT 'class_sessions'      AS tabla, count(*) AS filas FROM class_sessions cs
  JOIN activities a ON a.id = cs.activity_id JOIN schools s ON s.id = a.school_id WHERE s.slug='cidmi'
UNION ALL SELECT 'class_attendance', count(*) FROM class_attendance ca
  JOIN class_sessions cs ON cs.id=ca.session_id JOIN activities a ON a.id=cs.activity_id
  JOIN schools s ON s.id=a.school_id WHERE s.slug='cidmi'
UNION ALL SELECT 'class_eventualities', count(*) FROM class_eventualities ce
  JOIN class_sessions cs ON cs.id=ce.session_id JOIN activities a ON a.id=cs.activity_id
  JOIN schools s ON s.id=a.school_id WHERE s.slug='cidmi'
UNION ALL SELECT 'class_observations (preservadas)', count(*) FROM class_observations co
  JOIN class_sessions cs ON cs.id=co.session_id JOIN activities a ON a.id=cs.activity_id
  JOIN schools s ON s.id=a.school_id WHERE s.slug='cidmi'
UNION ALL SELECT 'students', count(*) FROM students st JOIN schools s ON s.id=st.school_id WHERE s.slug='cidmi'
UNION ALL SELECT 'enrollments', count(*) FROM enrollments e JOIN activities a ON a.id=e.activity_id
  JOIN schools s ON s.id=a.school_id WHERE s.slug='cidmi'
UNION ALL SELECT 'activities activas', count(*) FROM activities a JOIN schools s ON s.id=a.school_id
  WHERE s.slug='cidmi' AND a.is_active = true;

-- ============================================================
-- 8. RESTORE / DROP — NO correr ahora. Después del día 14.
-- ============================================================
-- Restore (si el piloto falla y hay que reconstruir el estado del 10 sep 2026).
-- Orden FK-safe: sesiones primero, después sus hijos.
--
-- BEGIN;
-- INSERT INTO class_sessions SELECT * FROM _backup_sprint3_class_sessions b
--   WHERE NOT EXISTS (SELECT 1 FROM class_sessions x WHERE x.id = b.id);
-- INSERT INTO class_attendance SELECT * FROM _backup_sprint3_class_attendance b
--   WHERE NOT EXISTS (SELECT 1 FROM class_attendance x WHERE x.id = b.id);
-- INSERT INTO class_eventualities SELECT * FROM _backup_sprint3_class_eventualities b
--   WHERE NOT EXISTS (SELECT 1 FROM class_eventualities x WHERE x.id = b.id);
-- COMMIT;
--
-- DROP (después del día 14, cuando la decisión del PRD §8 esté tomada):
--
-- DROP TABLE IF EXISTS _backup_sprint3_class_attendance;
-- DROP TABLE IF EXISTS _backup_sprint3_class_eventualities;
-- DROP TABLE IF EXISTS _backup_sprint3_class_sessions;

-- End of cleanup-cidmi-pre-pilot.sql
