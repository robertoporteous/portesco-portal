-- supabase/scripts/cleanup-smoke-test-sprint-3.sql
-- Sprint 3 Tarea 7 — borra la asistencia de PRUEBA del smoke manual.
--
-- POR QUÉ EXISTE
--   Roberto hace el smoke del Pad logueado como ADMIN antes del día 1. Eso deja
--   filas reales en class_attendance / class_eventualities y marca sesiones como
--   cerradas. Si quedan, el día 1 no arranca en cero y las métricas del PRD §6
--   ("días con asistencia cerrada en el Pad", "clases cerradas el mismo día")
--   arrancan contaminadas con datos que no son de Kassandra.
--
-- QUÉ BORRA — y qué NO
--   SÓLO lo que escribió ROBERTO, y sólo dentro de la ventana del piloto.
--   El filtro es por autor (`marked_by` / `created_by` / `closed_by`), no por
--   fecha de creación: así este script es seguro de correr aunque Kassandra ya
--   haya empezado. Nunca toca una fila suya.
--
--   NO toca la sesión vieja 51ba752e (16 jun 2026, cerrada en Bloque 2): está
--   fuera de la ventana.
--   NO toca students, enrollments, activities ni class_sessions más allá de
--   despintar closed_at/closed_by.
--   NO toca las observaciones de voz ni sus audios (Bloque 4).
--
-- EJECUTAR EN: Supabase Studio SQL Editor, DESPUÉS del smoke y ANTES del día 1.
-- IDEMPOTENTE: correrlo dos veces borra cero filas la segunda vez.

BEGIN;

-- ============================================================
-- 0. Pre-flight
-- ============================================================

DO $$
DECLARE
  rb_id  uuid;
BEGIN
  SELECT id INTO rb_id FROM users WHERE email = 'roberto.porteous.bim@gmail.com';
  IF rb_id IS NULL THEN
    RAISE EXCEPTION 'Pre-flight: no encuentro al usuario de Roberto. Sin él no sé qué filas son de prueba.';
  END IF;
  RAISE NOTICE 'Pre-flight OK — roberto=%', rb_id;
END $$;

-- ============================================================
-- 1. Qué se va a borrar (mirá esto ANTES de confiar en el commit)
-- ============================================================
-- Si alguna fila de acá NO es tuya, pará: el COMMIT está al final y podés
-- cambiar COMMIT por ROLLBACK antes de correr.

CREATE TEMP TABLE _smoke_scope ON COMMIT DROP AS
WITH rb AS (SELECT id FROM users WHERE email = 'roberto.porteous.bim@gmail.com'),
sc AS (SELECT id FROM schools WHERE slug = 'cidmi'),
ventana AS (
  SELECT cs.id, cs.scheduled_start_at, ac.name AS activity_name, cs.closed_by
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  JOIN sc ON sc.id = ac.school_id
  WHERE cs.scheduled_start_at >= (timestamp '2026-09-21 00:00' AT TIME ZONE 'America/Panama')
)
SELECT v.id AS session_id, v.scheduled_start_at, v.activity_name,
       (v.closed_by = (SELECT id FROM rb)) AS cerrada_por_roberto
FROM ventana v;

-- ============================================================
-- 2. Borrar
-- ============================================================

-- 2.1 asistencia marcada por Roberto
DELETE FROM class_attendance ca
USING _smoke_scope s, users u
WHERE ca.session_id = s.session_id
  AND u.email = 'roberto.porteous.bim@gmail.com'
  AND ca.marked_by = u.id;

-- 2.2 eventualidades creadas por Roberto
DELETE FROM class_eventualities ce
USING _smoke_scope s, users u
WHERE ce.session_id = s.session_id
  AND u.email = 'roberto.porteous.bim@gmail.com'
  AND ce.created_by = u.id;

-- 2.3 despintar el cierre que hizo Roberto (clase y día)
UPDATE class_sessions cs
SET closed_at = NULL, closed_by = NULL
FROM _smoke_scope s, users u
WHERE cs.id = s.session_id
  AND u.email = 'roberto.porteous.bim@gmail.com'
  AND cs.closed_by = u.id;

-- ============================================================
-- 3. Verificación — el día 1 tiene que arrancar en cero
-- ============================================================

DO $$
DECLARE
  att_rb    int;
  ev_rb     int;
  closed_rb int;
  att_otros int;
BEGIN
  SELECT count(*) INTO att_rb
  FROM class_attendance ca
  JOIN _smoke_scope s ON s.session_id = ca.session_id
  JOIN users u ON u.id = ca.marked_by
  WHERE u.email = 'roberto.porteous.bim@gmail.com';

  SELECT count(*) INTO ev_rb
  FROM class_eventualities ce
  JOIN _smoke_scope s ON s.session_id = ce.session_id
  JOIN users u ON u.id = ce.created_by
  WHERE u.email = 'roberto.porteous.bim@gmail.com';

  SELECT count(*) INTO closed_rb
  FROM class_sessions cs
  JOIN _smoke_scope s ON s.session_id = cs.id
  JOIN users u ON u.id = cs.closed_by
  WHERE u.email = 'roberto.porteous.bim@gmail.com';

  -- Lo de otros (= Kassandra) NO se toca. Se cuenta sólo para informar.
  SELECT count(*) INTO att_otros
  FROM class_attendance ca
  JOIN _smoke_scope s ON s.session_id = ca.session_id
  LEFT JOIN users u ON u.id = ca.marked_by
  WHERE u.email IS DISTINCT FROM 'roberto.porteous.bim@gmail.com';

  IF att_rb <> 0 OR ev_rb <> 0 OR closed_rb <> 0 THEN
    RAISE EXCEPTION
      'Verificación falló: quedaron filas de Roberto (asistencia=%, eventualidades=%, sesiones cerradas=%). Rollback.',
      att_rb, ev_rb, closed_rb;
  END IF;

  RAISE NOTICE 'Limpio. Filas de OTROS que se dejaron intactas: % (si Kassandra ya arrancó, son de ella)', att_otros;
END $$;

-- ============================================================
-- 4. Reporte visible en Studio
-- ============================================================

WITH sc AS (SELECT id FROM schools WHERE slug = 'cidmi'),
ventana AS (
  SELECT cs.id, cs.closed_at
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  JOIN sc ON sc.id = ac.school_id
  WHERE cs.scheduled_start_at >= (timestamp '2026-09-21 00:00' AT TIME ZONE 'America/Panama')
),
lineas(ord, line) AS (
  SELECT 1, '=== LIMPIEZA DEL SMOKE — el piloto arranca en cero ==='
  UNION ALL SELECT 2, format('sesiones del piloto: %s', (SELECT count(*) FROM ventana))
  UNION ALL SELECT 3, format('sesiones cerradas que quedan: %s  (esperado 0 si Kassandra no arrancó)',
    (SELECT count(*) FROM ventana WHERE closed_at IS NOT NULL))
  UNION ALL SELECT 4, format('filas de class_attendance en el piloto: %s  (esperado 0)',
    (SELECT count(*) FROM class_attendance ca JOIN ventana v ON v.id = ca.session_id))
  UNION ALL SELECT 5, format('filas de class_eventualities en el piloto: %s  (esperado 0)',
    (SELECT count(*) FROM class_eventualities ce JOIN ventana v ON v.id = ce.session_id))
)
SELECT line AS reporte FROM lineas ORDER BY ord;

COMMIT;

-- End of cleanup-smoke-test-sprint-3.sql
