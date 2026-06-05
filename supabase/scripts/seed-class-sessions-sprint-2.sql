-- supabase/scripts/seed-class-sessions-sprint-2.sql
-- Sprint 2 — Bloque 2 · Paso 1: calendario de sesiones del piloto CIDMI
--
-- OBJETIVO:
--   Crear 8 class_sessions para la actividad ÚNICA "Fútbol U14-U18" (los 36 niños
--   entrenan JUNTOS a la misma hora). La categoría U14/U16/U18 NO se duplica acá:
--   ya vive en students.grade y _pilot_parent_contacts.group_label, y se usa solo
--   para agrupar visualmente la lista de asistencia en Paso 4 (vista de clase).
--
--   NO parte la actividad en sub-grupos. NO renombra. NO toca enrollments.
--
-- CALENDARIO:
--   Martes y jueves, 4 semanas: Jun 9, 11, 16, 18, 23, 25, 30, Jul 2 (2026).
--   17:00–18:30 hora Panamá (UTC-5). timestamptz con offset -05 explícito.
--   actual_start_at / actual_end_at / closed_at / closed_by = NULL (sesión abierta).
--   Sin asistencia (eso es UI de Paso 3+).
--
-- NO es migración. 0009 está reservado para Sprint 3. Se aplica MANUAL en
-- Supabase Studio SQL Editor (service_role bypass RLS).
--
-- IDEMPOTENTE: re-run safe. No hay unique constraint en
-- (activity_id, scheduled_start_at), así que la idempotencia va por WHERE NOT EXISTS.

BEGIN;

-- ============================================================
-- 0. Pre-flight: refuse to seed if the pilot activity is missing
-- ============================================================
-- Depende de seed-cidmi-pilot-sprint-2.sql (crea la actividad "Fútbol U14-U18").

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM activities a
    JOIN schools s ON s.id = a.school_id
    WHERE s.slug = 'cidmi' AND a.name = 'Fútbol U14-U18'
  ) THEN
    RAISE EXCEPTION
      'Seed precondition failed: activity "Fútbol U14-U18" not found for school cidmi. '
      'Run seed-cidmi-pilot-sprint-2.sql first.';
  END IF;
END $$;

-- ============================================================
-- 1. 8 class_sessions — martes y jueves, 17:00–18:30 (UTC-5)
-- ============================================================

INSERT INTO class_sessions (activity_id, scheduled_start_at, scheduled_end_at)
SELECT a.id, slot.start_at, slot.end_at
FROM activities a
JOIN schools s ON s.id = a.school_id
CROSS JOIN (VALUES
  ('2026-06-09 17:00:00-05'::timestamptz, '2026-06-09 18:30:00-05'::timestamptz),
  ('2026-06-11 17:00:00-05'::timestamptz, '2026-06-11 18:30:00-05'::timestamptz),
  ('2026-06-16 17:00:00-05'::timestamptz, '2026-06-16 18:30:00-05'::timestamptz),
  ('2026-06-18 17:00:00-05'::timestamptz, '2026-06-18 18:30:00-05'::timestamptz),
  ('2026-06-23 17:00:00-05'::timestamptz, '2026-06-23 18:30:00-05'::timestamptz),
  ('2026-06-25 17:00:00-05'::timestamptz, '2026-06-25 18:30:00-05'::timestamptz),
  ('2026-06-30 17:00:00-05'::timestamptz, '2026-06-30 18:30:00-05'::timestamptz),
  ('2026-07-02 17:00:00-05'::timestamptz, '2026-07-02 18:30:00-05'::timestamptz)
) AS slot(start_at, end_at)
WHERE s.slug = 'cidmi'
  AND a.name = 'Fútbol U14-U18'
  AND NOT EXISTS (
    SELECT 1 FROM class_sessions cs
    WHERE cs.activity_id = a.id
      AND cs.scheduled_start_at = slot.start_at
  );

-- ============================================================
-- 2. Verification (NOTICE-level, antes del commit)
-- ============================================================

DO $$
DECLARE
  activity_count  int;
  sessions_count  int;
  open_count      int;
BEGIN
  SELECT count(*) INTO activity_count
  FROM activities a JOIN schools s ON s.id = a.school_id
  WHERE s.slug = 'cidmi' AND a.name = 'Fútbol U14-U18';

  SELECT count(*) INTO sessions_count
  FROM class_sessions cs
  JOIN activities a ON a.id = cs.activity_id
  JOIN schools s ON s.id = a.school_id
  WHERE s.slug = 'cidmi' AND a.name = 'Fútbol U14-U18';

  SELECT count(*) INTO open_count
  FROM class_sessions cs
  JOIN activities a ON a.id = cs.activity_id
  JOIN schools s ON s.id = a.school_id
  WHERE s.slug = 'cidmi' AND a.name = 'Fútbol U14-U18' AND cs.closed_at IS NULL;

  RAISE NOTICE 'Seed class_sessions Sprint 2 B2 — futbol_u14_u18=% sessions=% open(closed_at null)=%',
    activity_count, sessions_count, open_count;
  RAISE NOTICE 'Expected: 1 / 8 / 8';
END $$;

COMMIT;

-- End of seed-class-sessions-sprint-2.sql
