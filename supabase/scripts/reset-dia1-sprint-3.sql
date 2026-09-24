-- supabase/scripts/reset-dia1-sprint-3.sql
-- Sprint 3 — mover DIA_1 del lunes 21 al lunes 28 de septiembre de 2026.
--
-- POR QUÉ
--   Las sesiones se generaron con DIA_1 = 21 sep, pero el piloto no arrancó ese
--   día: Kassandra nunca entró (último login 5 jun 2026) y la semana del 21 al 25
--   pasó sin una sola marca de asistencia. Si esas 18 sesiones quedan, arrancan
--   como días con clases nunca cerradas y ensucian justo la métrica principal
--   del PRD §6 ("días con asistencia cerrada en el Pad").
--
-- QUÉ HACE, ATÓMICO (un solo BEGIN/COMMIT)
--   1. Borra UNA observación de prueba concreta, por id (ver más abajo). Es la
--      única excepción al guard del paso 2, y es explícita a propósito.
--   2. ABORTA si queda cualquier OTRO dato en las 18 sesiones a borrar
--      (asistencia, eventualidades u observaciones). Si hay, alguien las usó:
--      no son descartables y hay que mirarlas a mano.
--   3. Borra las 18 sesiones de la semana del 21 al 27 de septiembre.
--   4. Agrega la 4ª semana nueva (19 al 23 de octubre), para que la ventana
--      vuelva a ser de 4 semanas completas desde el nuevo DIA_1.
--   5. Verifica: 72 sesiones entre el 28 de septiembre y el 25 de octubre, y
--      cero sesiones del piloto antes del 28.
--
-- LA OBSERVACIÓN QUE SE BORRA — 362a8dbe-b2f5-447c-bffc-b0c21577c633
--   Autor en la DB: Alexander Watson (professor). En realidad la escribió
--   ROBERTO el 22 sep 2026 probando CON LA SESIÓN de Alexander (confirmado por
--   él, 24 sep). Es data de PRUEBA que quedó con el nombre de un alumno real
--   (Victor Palumbo, 11vo), así que se borra en vez de preservarse.
--
--   Por qué es seguro:
--     - mention_assignments = 0 (se confirmó deseleccionando la única mención;
--       el confirm inserta con `if (rows.length > 0)`, así que cero es correcto).
--     - profile_observations = 0 → el perfil del alumno nunca recibió nada.
--     - El script VUELVE A VERIFICAR las dos cosas y aborta si no dan cero.
--   El row de audit_logs NO se borra: la FK related_observation_id es
--   ON DELETE SET NULL, así que la auditoría sobrevive con ese campo en NULL.
--   Eso es deliberado (AGENTS.md §3.3: no se borra rastro de una call al LLM).
--
--   Por qué el cleanup del smoke no la vio: ese script filtra por autor
--   (`marked_by`/`created_by`/`closed_by` = Roberto) y esta fila tiene
--   author_id = Alexander. Filtrar por autor es lo correcto — es lo que lo hace
--   seguro de correr con Kassandra ya trabajando — pero no alcanza cuando
--   Roberto prueba con la sesión de otro. La regla que sale de esto está en
--   AGENTS.md §9: no volver a probar con sesiones de usuarios reales.
--
-- ORDEN DE EJECUCIÓN — IMPORTA
--   Si Roberto hizo el smoke manual sobre las clases de esta semana, corré
--   PRIMERO cleanup-smoke-test-sprint-3.sql. Ese borra su asistencia de prueba,
--   y sólo entonces el guard del paso 1 pasa. Si lo corrés al revés, este script
--   aborta — a propósito.
--
-- NO TOCA
--   La sesión vieja 51ba752e (16 jun 2026) ni sus observaciones de voz: está
--   fuera del rango de borrado, que arranca el 21 de septiembre.
--   Tampoco students, enrollments ni activities.
--
-- EJECUTAR EN: Supabase Studio SQL Editor.
-- IDEMPOTENTE: la segunda corrida borra 0 e inserta 0.

BEGIN;

-- ============================================================
-- 0. Borrar la observación de prueba (excepción explícita, por id)
-- ============================================================

DO $$
DECLARE
  obs_id  uuid := '362a8dbe-b2f5-447c-bffc-b0c21577c633';
  existe  boolean;
  ment_n  int;
  prof_n  int;
BEGIN
  SELECT EXISTS(SELECT 1 FROM class_observations WHERE id = obs_id) INTO existe;

  IF NOT existe THEN
    RAISE NOTICE 'La observación % ya no existe (re-run). Sigo.', obs_id;
  ELSE
    SELECT count(*) INTO ment_n FROM mention_assignments WHERE observation_id = obs_id;

    SELECT count(*) INTO prof_n
    FROM profile_observations po
    JOIN mention_assignments ma ON ma.id = po.mention_id
    WHERE ma.observation_id = obs_id;

    IF ment_n > 0 OR prof_n > 0 THEN
      RAISE EXCEPTION
        'ABORTADO: la observación % tiene menciones (%) o filas de perfil (%). '
        'Se confirmó y propagó al perfil de un menor: NO es descartable sin revisarla.',
        obs_id, ment_n, prof_n;
    END IF;

    DELETE FROM class_observations WHERE id = obs_id;
    RAISE NOTICE 'Observación de prueba % borrada (0 menciones, 0 filas de perfil).', obs_id;
  END IF;
END $$;

-- ============================================================
-- 1. Pre-flight + guard: lo que queda por borrar tiene que estar sin usar
-- ============================================================

DO $$
DECLARE
  sc_id      uuid;
  a_borrar   int;
  att_n      int;
  ev_n       int;
  obs_n      int;
BEGIN
  SELECT id INTO sc_id FROM schools WHERE slug = 'cidmi';
  IF sc_id IS NULL THEN
    RAISE EXCEPTION 'Pre-flight: no existe la school cidmi.';
  END IF;

  -- Las sesiones en el rango a borrar: [21 sep, 28 sep) hora de Panamá.
  CREATE TEMP TABLE _a_borrar ON COMMIT DROP AS
  SELECT cs.id
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  WHERE ac.school_id = sc_id
    AND cs.scheduled_start_at >= (timestamp '2026-09-21 00:00' AT TIME ZONE 'America/Panama')
    AND cs.scheduled_start_at <  (timestamp '2026-09-28 00:00' AT TIME ZONE 'America/Panama');

  SELECT count(*) INTO a_borrar FROM _a_borrar;

  SELECT count(*) INTO att_n
  FROM class_attendance ca JOIN _a_borrar b ON b.id = ca.session_id;

  SELECT count(*) INTO ev_n
  FROM class_eventualities ce JOIN _a_borrar b ON b.id = ce.session_id;

  SELECT count(*) INTO obs_n
  FROM class_observations co JOIN _a_borrar b ON b.id = co.session_id;

  RAISE NOTICE 'A borrar: % sesiones (asistencia=%, eventualidades=%, observaciones=%)',
    a_borrar, att_n, ev_n, obs_n;

  IF att_n > 0 OR ev_n > 0 OR obs_n > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: las sesiones del 21-27 sep todavía tienen datos (asistencia=%, '
      'eventualidades=%, observaciones=%) más allá de la observación de prueba que el paso 0 '
      'ya borró. Alguien más las usó: NO son descartables. Si es el smoke de Roberto, corré '
      'cleanup-smoke-test-sprint-3.sql. Si no, identificá autor y fecha antes de borrar nada.',
      att_n, ev_n, obs_n;
  END IF;

  IF a_borrar <> 18 THEN
    RAISE WARNING
      'Esperaba 18 sesiones a borrar y encontré %. No es bloqueante, pero revisá el reporte final.',
      a_borrar;
  END IF;
END $$;

-- ============================================================
-- 2. Borrar la semana vieja (21-27 sep)
-- ============================================================

DELETE FROM class_sessions cs
USING _a_borrar b
WHERE cs.id = b.id;

-- ============================================================
-- 3. Agregar la 4ª semana nueva, con DIA_1 = lunes 28 sep
-- ============================================================
-- Mismos 18 bloques semanales que generate-class-sessions-sprint-3.sql, con el
-- DIA_1 corrido una semana. El guard WHERE NOT EXISTS hace que sólo entren las
-- que faltan (la semana del 19 al 23 de octubre): las 54 del 28 sep al 18 oct
-- ya existen y se conservan intactas.

WITH params AS (
  SELECT
    date '2026-09-28' AS dia_1,     -- NUEVO DIA_1 (lunes). Antes: 2026-09-21.
    4                 AS semanas
),
bloques(activity_name, dia_offset, hora_inicio, hora_fin) AS (VALUES
  -- ── Primaria ────────────────────────────────────────────────────────────
  ('Fútbol Primaria',        0, time '14:30', time '16:00'),  -- lunes    2:30-4:00
  ('Fútbol Primaria',        2, time '13:00', time '14:30'),  -- miércoles 1:00-2:30
  ('Voleibol Primaria',      1, time '14:30', time '16:00'),  -- martes   2:30-4:00
  ('Voleibol Primaria',      3, time '14:30', time '16:00'),  -- jueves   2:30-4:00
  ('Basketball Primaria',    1, time '14:30', time '16:00'),  -- martes   2:30-4:00
  ('Basketball Primaria',    3, time '14:30', time '16:00'),  -- jueves   2:30-4:00
  ('Baile Urbano Primaria',  1, time '14:30', time '15:30'),  -- martes   2:30-3:30
  ('Baile Urbano Primaria',  3, time '14:30', time '15:30'),  -- jueves   2:30-3:30
  ('Flag Football Primaria', 1, time '14:30', time '16:00'),  -- martes   2:30-4:00
  ('Flag Football Primaria', 3, time '14:30', time '16:00'),  -- jueves   2:30-4:00
  ('Porrismo Primaria',      2, time '13:00', time '14:00'),  -- miércoles 1:00-2:00
  ('Porrismo Primaria',      4, time '14:30', time '15:30'),  -- viernes  2:30-3:30
  ('Ajedrez Primaria',       4, time '14:30', time '15:30'),  -- viernes  2:30-3:30
  -- ── Secundaria ──────────────────────────────────────────────────────────
  ('Fútbol Secundaria',      1, time '14:45', time '16:15'),  -- martes   2:45-4:15
  ('Fútbol Secundaria',      3, time '14:45', time '16:15'),  -- jueves   2:45-4:15
  ('Voleibol Secundaria',    1, time '14:45', time '16:15'),  -- martes   2:45-4:15
  ('Voleibol Secundaria',    3, time '14:45', time '16:15'),  -- jueves   2:45-4:15
  ('Ajedrez Secundaria',     4, time '14:30', time '15:30')   -- viernes  2:30-3:30
),
sesiones AS (
  SELECT
    b.activity_name,
    ((p.dia_1 + (w.n * 7) + b.dia_offset) + b.hora_inicio) AT TIME ZONE 'America/Panama' AS start_at,
    ((p.dia_1 + (w.n * 7) + b.dia_offset) + b.hora_fin)    AT TIME ZONE 'America/Panama' AS end_at
  FROM bloques b
  CROSS JOIN params p
  CROSS JOIN LATERAL generate_series(0, p.semanas - 1) AS w(n)
)
INSERT INTO class_sessions (activity_id, scheduled_start_at, scheduled_end_at)
SELECT ac.id, s.start_at, s.end_at
FROM sesiones s
JOIN schools sc ON sc.slug = 'cidmi'
JOIN activities ac ON ac.school_id = sc.id AND ac.name = s.activity_name AND ac.is_active
WHERE NOT EXISTS (
  SELECT 1 FROM class_sessions cs
  WHERE cs.activity_id = ac.id
    AND cs.scheduled_start_at = s.start_at
);

-- ============================================================
-- 4. Verificación dura — rollback si algo no cuadra
-- ============================================================

DO $$
DECLARE
  sc_id     uuid;
  ventana_n int;
  antes_n   int;
  tz_ok     timestamptz;
BEGIN
  SELECT id INTO sc_id FROM schools WHERE slug = 'cidmi';

  -- 72 sesiones en la ventana nueva: [28 sep, 26 oct)
  SELECT count(*) INTO ventana_n
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  WHERE ac.school_id = sc_id
    AND cs.scheduled_start_at >= (timestamp '2026-09-28 00:00' AT TIME ZONE 'America/Panama')
    AND cs.scheduled_start_at <  (timestamp '2026-10-26 00:00' AT TIME ZONE 'America/Panama');

  IF ventana_n <> 72 THEN
    RAISE EXCEPTION
      'Verificación: % sesiones en la ventana nueva (28 sep - 25 oct), esperaba 72. Rollback.',
      ventana_n;
  END IF;

  -- Cero sesiones del piloto antes del nuevo DIA_1. El corte arranca el 1 de
  -- septiembre para no contar la sesión vieja de junio, que se conserva.
  SELECT count(*) INTO antes_n
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  WHERE ac.school_id = sc_id
    AND cs.scheduled_start_at >= (timestamp '2026-09-01 00:00' AT TIME ZONE 'America/Panama')
    AND cs.scheduled_start_at <  (timestamp '2026-09-28 00:00' AT TIME ZONE 'America/Panama');

  IF antes_n <> 0 THEN
    RAISE EXCEPTION
      'Verificación: quedaron % sesiones del piloto antes del 28 sep. Rollback.', antes_n;
  END IF;

  -- Control de zona horaria sobre la semana NUEVA: martes 20 oct, Voleibol
  -- Primaria 2:30 PM Panamá = 19:30Z.
  SELECT cs.scheduled_start_at INTO tz_ok
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  WHERE ac.school_id = sc_id
    AND ac.name = 'Voleibol Primaria'
    AND cs.scheduled_start_at::date = date '2026-10-20';

  IF tz_ok IS DISTINCT FROM timestamptz '2026-10-20 19:30:00+00' THEN
    RAISE EXCEPTION
      'Verificación de zona horaria en la semana nueva: quedó %, esperaba 19:30Z. Rollback.', tz_ok;
  END IF;
END $$;

-- ============================================================
-- 5. Reporte visible en Studio
-- ============================================================

WITH sc AS (SELECT id FROM schools WHERE slug = 'cidmi'),
ventana AS (
  SELECT ac.name AS activity_name, cs.scheduled_start_at, cs.scheduled_end_at
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  JOIN sc ON sc.id = ac.school_id
  WHERE cs.scheduled_start_at >= (timestamp '2026-09-28 00:00' AT TIME ZONE 'America/Panama')
    AND cs.scheduled_start_at <  (timestamp '2026-10-26 00:00' AT TIME ZONE 'America/Panama')
),
lineas(ord, line) AS (
  SELECT 1, '=== DIA_1 MOVIDO AL LUNES 28 SEP 2026 ==='
  UNION ALL SELECT 2, format('sesiones en la ventana nueva: %s  (esperado 72)',
    (SELECT count(*) FROM ventana))
  UNION ALL SELECT 3, format('primera: %s   ultima: %s   (hora de Panamá)',
    (SELECT to_char(min(scheduled_start_at) AT TIME ZONE 'America/Panama', 'Dy DD Mon HH24:MI') FROM ventana),
    (SELECT to_char(max(scheduled_start_at) AT TIME ZONE 'America/Panama', 'Dy DD Mon HH24:MI') FROM ventana))
  UNION ALL SELECT 4, format('sesiones del piloto antes del 28 sep: %s  (esperado 0)',
    (SELECT count(*) FROM class_sessions cs JOIN activities ac ON ac.id = cs.activity_id JOIN sc ON sc.id = ac.school_id
     WHERE cs.scheduled_start_at >= (timestamp '2026-09-01 00:00' AT TIME ZONE 'America/Panama')
       AND cs.scheduled_start_at <  (timestamp '2026-09-28 00:00' AT TIME ZONE 'America/Panama')))
  UNION ALL SELECT 5, format('la sesión vieja de junio sigue ahí: %s  (esperado 1, no se toca)',
    (SELECT count(*) FROM class_sessions cs JOIN activities ac ON ac.id = cs.activity_id JOIN sc ON sc.id = ac.school_id
     WHERE cs.scheduled_start_at < (timestamp '2026-09-01 00:00' AT TIME ZONE 'America/Panama')))
  UNION ALL SELECT 6, ''
  UNION ALL SELECT 7, '--- sesiones por actividad (8 las de 2 bloques, 4 los dos Ajedrez) ---'
  UNION ALL
  SELECT 10, format('%-26s %s sesiones', activity_name, count(*))
  FROM ventana GROUP BY activity_name
  UNION ALL SELECT 20, ''
  UNION ALL SELECT 21, '--- primera semana del piloto, en hora de Panamá ---'
  UNION ALL
  SELECT 30, format('%s  %-26s %s-%s',
                    to_char(scheduled_start_at AT TIME ZONE 'America/Panama', 'Dy DD Mon'),
                    activity_name,
                    to_char(scheduled_start_at AT TIME ZONE 'America/Panama', 'HH24:MI'),
                    to_char(scheduled_end_at   AT TIME ZONE 'America/Panama', 'HH24:MI'))
  FROM ventana
  WHERE scheduled_start_at < (timestamp '2026-10-05 00:00' AT TIME ZONE 'America/Panama')
)
SELECT line AS reporte FROM lineas ORDER BY ord, line;

COMMIT;

-- End of reset-dia1-sprint-3.sql
