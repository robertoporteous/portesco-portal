-- supabase/scripts/seed-activities-sprint-3.sql
-- Sprint 3 — Piloto CIDMI (solo asistencia). TAREA 3: las 13 actividades reales.
--
-- QUÉ HACE:
--   1. Renombra `Fútbol U14-U18` (Sprint 2) → `Fútbol Secundaria`.
--      Conserva el id (ec65a576-af31-4b37-8640-a57a21895668), sus 36 enrollments
--      y el staff_activities de Alexander Watson. NO se borra ni se recrea.
--   2. Inserta las otras 12 actividades (7 Primaria + 5 Secundaria).
--
-- MODELO: 1 actividad = deporte × nivel (Primaria/Secundaria).
--   Las categorías U8/U10/U12/U14/U16/U18 NO son actividades: se derivan de
--   students.grade, igual que en Bloque 2.
--   NO se crean `Porrismo Secundaria` ni `Fútbol Femenino` (sin inscritos —
--   confirmado por Roberto 10 sep 2026).
--
-- NO SE CREAN AQUÍ las class_sessions: eso es Tarea 5
-- (supabase/scripts/generate-class-sessions-sprint-3.sql).
--
-- SOBRE schedule / days_of_week / start_time / end_time:
--   El Coordinator Pad NO lee estas columnas — arma "clases de hoy" desde
--   class_sessions.scheduled_start_at. Son metadata de display (las usa solo el
--   dashboard del padre, fuera de este piloto) y toleran NULL.
--   Varias actividades tienen 2 bloques semanales con HORAS DISTINTAS (ej. Fútbol
--   Primaria: lunes 2:30-4:00 y miércoles 1:00-2:30), y el schema solo tiene un
--   par start_time/end_time. Regla aplicada: start_time/end_time = el PRIMER
--   bloque de la semana; `schedule` lleva el label humano completo con ambos
--   bloques. La verdad operativa vive en class_sessions (Tarea 5).
--
-- FUENTE DEL HORARIO: sprint-3-cidmi-horario.md (PDFs horario primaria/secundaria
--   CIDMI + Ajedrez confirmado verbalmente por Roberto, 10 sep 2026).
--
-- ⚠️ monthly_price = 0.00 EN LAS 13, A PROPÓSITO (decisión Roberto, 10 sep 2026).
--   activities.monthly_price es NOT NULL sin default, así que hay que escribir algo.
--   Se pone 0.00 — no un precio plausible — para que sea OBVIO que NO es un precio
--   real y nadie lo lea como dato de facturación. Los precios reales entran con el
--   lado padre / PortescoPay, no en este sprint: el piloto es SOLO asistencia y Ana
--   sigue cobrando fuera del Portal.
--   `Fútbol Secundaria` también baja a 0.00: el 35 que traía era el placeholder del
--   piloto de Sprint 2, tampoco un precio real.
--
-- EJECUTAR EN: Supabase Studio SQL Editor (service_role bypassea RLS).
-- IDEMPOTENTE: re-run safe (WHERE NOT EXISTS en los INSERT; el UPDATE del rename
--   matchea 0 filas en la segunda corrida).

BEGIN;

-- ============================================================
-- 0. Pre-flight: CIDMI existe y la actividad del piloto Sprint 2 está donde creemos
-- ============================================================

DO $$
DECLARE
  cidmi_id   uuid;
  futbol_id  uuid;
BEGIN
  SELECT id INTO cidmi_id FROM schools WHERE slug = 'cidmi';

  IF cidmi_id IS NULL THEN
    RAISE EXCEPTION 'Pre-flight failed: no existe la school con slug = ''cidmi''.';
  END IF;

  SELECT id INTO futbol_id
  FROM activities
  WHERE school_id = cidmi_id
    AND name IN ('Fútbol U14-U18', 'Fútbol Secundaria');

  IF futbol_id IS NULL THEN
    RAISE EXCEPTION
      'Pre-flight failed: no encuentro la actividad del piloto Sprint 2 '
      '(ni ''Fútbol U14-U18'' ni ''Fútbol Secundaria'') en CIDMI. '
      'Sin ella el rename no aplica y los 36 enrollments quedarían huérfanos. Pará y revisá.';
  END IF;

  IF futbol_id <> 'ec65a576-af31-4b37-8640-a57a21895668'::uuid THEN
    RAISE WARNING
      'Pre-flight: la actividad de Fútbol tiene id % (esperado ec65a576-af31-4b37-8640-a57a21895668). '
      'No es bloqueante, pero verificá que sea la correcta.', futbol_id;
  END IF;

  RAISE NOTICE 'Pre-flight OK — cidmi=% futbol_actividad=%', cidmi_id, futbol_id;
END $$;

-- ============================================================
-- 1. Rename: Fútbol U14-U18 → Fútbol Secundaria
-- ============================================================
-- Conserva id, enrollments (36) y staff_activities de Alexander.
-- Se corrige además el horario de display: el row de Sprint 2 decía
-- "martes y jueves 5:00-6:30 PM" (horario del piloto), y el horario real de
-- Secundaria es martes y jueves 2:45-4:15 PM.

UPDATE activities a
SET name          = 'Fútbol Secundaria',
    monthly_price = 0.00,  -- era 35 (placeholder de Sprint 2) — ver nota del header
    schedule      = 'Martes y jueves 2:45-4:15 PM',
    days_of_week  = array['martes', 'jueves'],
    start_time    = '14:45'::time,
    end_time      = '16:15'::time
FROM schools s
WHERE s.id = a.school_id
  AND s.slug = 'cidmi'
  AND a.name = 'Fútbol U14-U18';

-- ============================================================
-- 2. Las otras 12 actividades
-- ============================================================
-- Primaria (7): Fútbol · Voleibol · Basketball · Baile Urbano · Flag Football · Porrismo · Ajedrez
-- Secundaria (5): Voleibol · Basketball · Baile Urbano · Flag Football · Ajedrez
--   (Fútbol Secundaria ya existe por el rename del paso 1.)

INSERT INTO activities (
  school_id, name, category, monthly_price, schedule, days_of_week, start_time, end_time, is_active
)
SELECT
  s.id,
  v.name,
  v.category::activity_category,
  v.monthly_price,
  v.schedule,
  v.days_of_week,
  v.start_time::time,
  v.end_time::time,
  true
FROM schools s
CROSS JOIN (values
  -- ---------- PRIMARIA ----------
  ('Fútbol Primaria',        'deporte',   0.00, 'Lunes 2:30-4:00 PM y miércoles 1:00-2:30 PM',  array['lunes', 'miercoles'],   '14:30', '16:00'),
  ('Voleibol Primaria',      'deporte',   0.00, 'Martes y jueves 2:30-4:00 PM',                 array['martes', 'jueves'],     '14:30', '16:00'),
  ('Basketball Primaria',    'deporte',   0.00, 'Martes y jueves 2:30-4:00 PM',                 array['martes', 'jueves'],     '14:30', '16:00'),
  ('Baile Urbano Primaria',  'arte',      0.00, 'Martes y jueves 2:30-3:30 PM',                 array['martes', 'jueves'],     '14:30', '15:30'),
  ('Flag Football Primaria', 'deporte',   0.00, 'Martes y jueves 2:30-4:00 PM',                 array['martes', 'jueves'],     '14:30', '16:00'),
  ('Porrismo Primaria',      'deporte',   0.00, 'Miércoles 1:00-2:00 PM y viernes 2:30-3:30 PM', array['miercoles', 'viernes'], '13:00', '14:00'),
  ('Ajedrez Primaria',       'academico', 0.00, 'Viernes 2:30-3:30 PM',                         array['viernes'],              '14:30', '15:30'),
  -- ---------- SECUNDARIA ----------
  ('Voleibol Secundaria',      'deporte',   0.00, 'Martes y jueves 2:45-4:15 PM',                  array['martes', 'jueves'],   '14:45', '16:15'),
  ('Basketball Secundaria',    'deporte',   0.00, 'Lunes 2:45-4:15 PM y miércoles 1:00-2:30 PM',   array['lunes', 'miercoles'], '14:45', '16:15'),
  ('Baile Urbano Secundaria',  'arte',      0.00, 'Martes y jueves 2:45-3:45 PM',                  array['martes', 'jueves'],   '14:45', '15:45'),
  ('Flag Football Secundaria', 'deporte',   0.00, 'Martes y jueves 2:45-4:15 PM',                  array['martes', 'jueves'],   '14:45', '16:15'),
  ('Ajedrez Secundaria',       'academico', 0.00, 'Viernes 2:30-3:30 PM',                          array['viernes'],            '14:30', '15:30')
) as v(name, category, monthly_price, schedule, days_of_week, start_time, end_time)
WHERE s.slug = 'cidmi'
  -- activities NO tiene unique (school_id, name) → guard explícito, no ON CONFLICT.
  -- El guard NO filtra por is_active: si la fila existe desactivada, no se duplica.
  AND NOT EXISTS (
    SELECT 1 FROM activities a
    WHERE a.school_id = s.id AND a.name = v.name
  );

-- ============================================================
-- 3. Verification (NOTICE-level, antes del commit)
-- ============================================================

DO $$
DECLARE
  cidmi_id          uuid;
  active_count      int;
  total_count       int;
  missing_names     text;
  futbol_sec_id     uuid;
  futbol_enrolls    int;
  alexander_link    boolean;
  old_name_left     int;
  demo_active       int;
BEGIN
  SELECT id INTO cidmi_id FROM schools WHERE slug = 'cidmi';

  -- 3.1 — las 13 esperadas existen y están activas
  SELECT count(*) INTO active_count
  FROM activities
  WHERE school_id = cidmi_id AND is_active = true;

  SELECT count(*) INTO total_count
  FROM activities
  WHERE school_id = cidmi_id;

  SELECT string_agg(e.name, ', ') INTO missing_names
  FROM (values
    ('Fútbol Primaria'), ('Voleibol Primaria'), ('Basketball Primaria'),
    ('Baile Urbano Primaria'), ('Flag Football Primaria'), ('Porrismo Primaria'),
    ('Ajedrez Primaria'),
    ('Fútbol Secundaria'), ('Voleibol Secundaria'), ('Basketball Secundaria'),
    ('Baile Urbano Secundaria'), ('Flag Football Secundaria'), ('Ajedrez Secundaria')
  ) AS e(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM activities a
    WHERE a.school_id = cidmi_id AND a.name = e.name AND a.is_active = true
  );

  -- 3.2 — el rename conservó id, enrollments y el link de Alexander
  SELECT id INTO futbol_sec_id
  FROM activities
  WHERE school_id = cidmi_id AND name = 'Fútbol Secundaria';

  SELECT count(*) INTO futbol_enrolls
  FROM enrollments WHERE activity_id = futbol_sec_id;

  SELECT EXISTS(
    SELECT 1 FROM staff_activities sa
    JOIN users u ON u.id = sa.user_id
    WHERE sa.activity_id = futbol_sec_id AND u.email = lower('Portescosport@gmail.com')
  ) INTO alexander_link;

  SELECT count(*) INTO old_name_left
  FROM activities WHERE school_id = cidmi_id AND name = 'Fútbol U14-U18';

  -- 3.3 — las 4 demo del seed 0003 siguen desactivadas
  SELECT count(*) INTO demo_active
  FROM activities
  WHERE school_id = cidmi_id
    AND name IN ('Fútbol', 'Basketball', 'Atletismo', 'Ajedrez')
    AND is_active = true;

  RAISE NOTICE '--- Tarea 3 · actividades CIDMI ---';
  RAISE NOTICE 'activas=%  (esperado 13)', active_count;
  RAISE NOTICE 'totales=%  (esperado 17 = 13 nuevas + 4 demo desactivadas)', total_count;
  RAISE NOTICE 'faltantes=%  (esperado <NULL>)', coalesce(missing_names, '<NULL>');
  RAISE NOTICE 'futbol_secundaria_id=%  (esperado ec65a576-af31-4b37-8640-a57a21895668)', futbol_sec_id;
  RAISE NOTICE 'enrollments en Fútbol Secundaria=%  (esperado 36)', futbol_enrolls;
  RAISE NOTICE 'staff_activities Alexander→Fútbol Secundaria=%  (esperado t)', alexander_link;
  RAISE NOTICE 'filas con el nombre viejo Fútbol U14-U18=%  (esperado 0)', old_name_left;
  RAISE NOTICE 'demo 0003 activas=%  (esperado 0)', demo_active;

  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION 'Verificación falló: faltan actividades activas: %. Rollback.', missing_names;
  END IF;

  IF active_count <> 13 THEN
    RAISE EXCEPTION 'Verificación falló: % actividades activas en CIDMI, esperaba 13. Rollback.', active_count;
  END IF;

  IF futbol_enrolls <> 36 THEN
    RAISE EXCEPTION
      'Verificación falló: Fútbol Secundaria tiene % enrollments, esperaba 36. '
      'El rename debió conservarlos. Rollback.', futbol_enrolls;
  END IF;

  IF NOT alexander_link THEN
    RAISE EXCEPTION 'Verificación falló: se perdió el staff_activities de Alexander. Rollback.';
  END IF;
END $$;

-- ============================================================
-- 4. Reporte final visible en Studio
-- ============================================================
-- Studio NO muestra los RAISE NOTICE de arriba (van al log de Postgres), y solo
-- renderiza el resultado del ÚLTIMO statement. Por eso el reporte va acá como un
-- SELECT de una sola columna de texto: esto es lo que tenés que leer.

WITH esperadas(name) AS (values
    ('Fútbol Primaria'), ('Voleibol Primaria'), ('Basketball Primaria'),
    ('Baile Urbano Primaria'), ('Flag Football Primaria'), ('Porrismo Primaria'),
    ('Ajedrez Primaria'),
    ('Fútbol Secundaria'), ('Voleibol Secundaria'), ('Basketball Secundaria'),
    ('Baile Urbano Secundaria'), ('Flag Football Secundaria'), ('Ajedrez Secundaria')
  ),
cidmi AS (SELECT id FROM schools WHERE slug = 'cidmi'),
act AS (
  SELECT a.* FROM activities a JOIN cidmi c ON c.id = a.school_id
),
checks(ord, line) AS (
  SELECT 1, '=== TAREA 3 · ACTIVIDADES CIDMI ==='
  UNION ALL SELECT 2, format('activas: %s  (esperado 13)%s',
    (SELECT count(*) FROM act WHERE is_active),
    CASE WHEN (SELECT count(*) FROM act WHERE is_active) = 13 THEN '  OK' ELSE '  <<< MAL' END)
  UNION ALL SELECT 3, format('totales: %s  (esperado 17 = 13 nuevas + 4 demo desactivadas)',
    (SELECT count(*) FROM act))
  UNION ALL SELECT 4, format('faltantes: %s',
    coalesce((SELECT string_agg(e.name, ', ') FROM esperadas e
              WHERE NOT EXISTS (SELECT 1 FROM act a WHERE a.name = e.name AND a.is_active)),
             'ninguna  OK'))
  UNION ALL SELECT 5, format('inesperadas activas: %s',
    coalesce((SELECT string_agg(a.name, ', ') FROM act a
              WHERE a.is_active AND a.name NOT IN (SELECT name FROM esperadas)),
             'ninguna  OK'))
  UNION ALL SELECT 6, format('Fútbol Secundaria id: %s  (esperado ec65a576-af31-4b37-8640-a57a21895668)',
    (SELECT id FROM act WHERE name = 'Fútbol Secundaria'))
  UNION ALL SELECT 7, format('enrollments en Fútbol Secundaria: %s  (esperado 36)',
    (SELECT count(*) FROM enrollments e WHERE e.activity_id = (SELECT id FROM act WHERE name = 'Fútbol Secundaria')))
  UNION ALL SELECT 8, format('staff_activities Alexander -> Fútbol Secundaria: %s  (esperado true)',
    (SELECT EXISTS(SELECT 1 FROM staff_activities sa JOIN users u ON u.id = sa.user_id
                   WHERE sa.activity_id = (SELECT id FROM act WHERE name = 'Fútbol Secundaria')
                     AND u.email = lower('Portescosport@gmail.com'))))
  UNION ALL SELECT 9, format('filas con el nombre viejo "Fútbol U14-U18": %s  (esperado 0)',
    (SELECT count(*) FROM act WHERE name = 'Fútbol U14-U18'))
  UNION ALL SELECT 10, format('demo del seed 0003 activas: %s  (esperado 0)',
    (SELECT count(*) FROM act WHERE is_active AND name IN ('Fútbol', 'Basketball', 'Atletismo', 'Ajedrez')))
  UNION ALL SELECT 11, format('activas con monthly_price <> 0.00: %s  (esperado ninguna — es a propósito, ver header)',
    coalesce((SELECT string_agg(a.name || '=' || a.monthly_price, ', ') FROM act a
              WHERE a.is_active AND a.monthly_price <> 0), 'ninguna  OK'))
  UNION ALL SELECT 12, ''
  UNION ALL SELECT 13, '=== LAS 13 ACTIVAS (nombre | categoria | dias | horario | enrollments) ==='
),
listado(ord, line) AS (
  SELECT 20, format('%s | %s | %s | %s-%s | %s enrollments',
           rpad(a.name, 24), rpad(a.category::text, 9),
           array_to_string(a.days_of_week, '+'),
           substring(a.start_time::text, 1, 5), substring(a.end_time::text, 1, 5),
           (SELECT count(*) FROM enrollments e WHERE e.activity_id = a.id))
  FROM act a WHERE a.is_active
)
SELECT line AS reporte FROM (
  SELECT ord, line FROM checks
  UNION ALL
  SELECT ord, line FROM listado
) r ORDER BY ord, line;

COMMIT;

-- End of seed-activities-sprint-3.sql
