-- supabase/scripts/generate-class-sessions-sprint-3.sql
-- Sprint 3 — Piloto CIDMI (solo asistencia). TAREA 5: las sesiones del piloto.
--
-- QUÉ HACE
--   Genera las class_sessions de 4 semanas desde DIA_1, una por
--   (actividad × bloque semanal × semana). 4 semanas = los 14 días del piloto
--   + margen para la decisión del día 14.
--
--   SÓLO para las 10 actividades ACTIVAS. Las 3 que el seed de roster desactivó
--   por quedar sin un solo niño (Basketball, Baile Urbano y Flag Football de
--   Secundaria) NO reciben sesiones: si se reactivan con el addendum, se vuelve
--   a correr este script y las de esa actividad se crean solas (es idempotente).
--
-- PARAMETRIZACIÓN
--   Todo lo que se cambia está en el CTE `params` de abajo: DIA_1 y semanas.
--   DIA_1 = lunes 21 de septiembre de 2026. El script ABORTA si DIA_1 no cae
--   lunes: los offsets de día están calculados desde el lunes.
--
-- HORA / ZONA
--   Panamá es UTC-5 todo el año, sin horario de verano. Las horas se escriben
--   como hora local de Panamá y se convierten con `AT TIME ZONE 'America/Panama'`,
--   que interpreta el timestamp como local y devuelve timestamptz.
--   Control: un martes 2:30 PM Panamá tiene que quedar guardado como 19:30Z.
--   La verificación del final lo chequea explícitamente y hace rollback si falla.
--
-- FUENTE DEL HORARIO
--   sprint-3-cidmi-horario.md (PDFs horario primaria 2026 + secundaria 2025,
--   vigente en 2026; Ajedrez confirmado verbalmente por Roberto, 10 sep 2026).
--   Ajedrez Primaria y Secundaria comparten el viernes 2:30-3:30: son DOS
--   sesiones, una por actividad, no una compartida.
--   No hay feriados panameños dentro de la ventana (21 sep - 18 oct 2026).
--
-- EJECUTAR EN: Supabase Studio SQL Editor (service_role bypassea RLS).
-- IDEMPOTENTE: re-run safe. class_sessions_activity_start_idx NO es único, así
--   que el guard es WHERE NOT EXISTS sobre (activity_id, scheduled_start_at).
--
-- PRE-REQ: seed-activities-sprint-3.sql (commit 7acdd0d) y el seed de roster
--   (commit 1f3df3f) ya corridos.

BEGIN;

-- ============================================================
-- 0. Pre-flight
-- ============================================================

DO $$
DECLARE
  dia_1  date := date '2026-09-21';
  sc_id  uuid;
  act_n  int;
BEGIN
  IF extract(isodow from dia_1) <> 1 THEN
    RAISE EXCEPTION
      'Pre-flight: DIA_1 (%) cae %, no lunes. Los offsets de día del bloque de '
      'horarios se cuentan desde el lunes — corregí DIA_1 o los offsets.',
      dia_1, to_char(dia_1, 'Day');
  END IF;

  SELECT id INTO sc_id FROM schools WHERE slug = 'cidmi';
  IF sc_id IS NULL THEN
    RAISE EXCEPTION 'Pre-flight: no existe la school cidmi.';
  END IF;

  SELECT count(*) INTO act_n FROM activities WHERE school_id = sc_id AND is_active;
  IF act_n = 0 THEN
    RAISE EXCEPTION
      'Pre-flight: CIDMI no tiene actividades activas. Corré primero '
      'seed-activities-sprint-3.sql y el seed de roster.';
  END IF;

  RAISE NOTICE 'Pre-flight OK — dia_1=% (lunes), actividades activas=%', dia_1, act_n;
END $$;

-- ============================================================
-- 1. Generar las sesiones
-- ============================================================

WITH params AS (
  SELECT
    date '2026-09-21' AS dia_1,     -- lunes. Cambiar acá para mover el piloto.
    4                 AS semanas    -- 14 días de piloto + margen
),

-- Bloques semanales. dia_offset se cuenta desde DIA_1 (lunes):
--   0 = lunes · 1 = martes · 2 = miércoles · 3 = jueves · 4 = viernes
-- Las horas son HORA LOCAL DE PANAMÁ.
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
  -- NO van acá (desactivadas por quedar sin un solo niño):
  --   Basketball Secundaria   lunes 2:45-4:15 · miércoles 1:00-2:30
  --   Baile Urbano Secundaria martes y jueves 2:45-3:45
  --   Flag Football Secundaria martes y jueves 2:45-4:15
),

-- Una fila por (bloque × semana), con la fecha real y el instante en timestamptz.
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
-- is_active SÍ filtra acá: las 3 desactivadas no reciben sesiones.
JOIN activities ac ON ac.school_id = sc.id AND ac.name = s.activity_name AND ac.is_active
WHERE NOT EXISTS (
  SELECT 1 FROM class_sessions cs
  WHERE cs.activity_id = ac.id
    AND cs.scheduled_start_at = s.start_at
);

-- ============================================================
-- 2. Verificación dura — rollback si algo no cuadra
-- ============================================================

DO $$
DECLARE
  dia_1     date := date '2026-09-21';
  semanas   int  := 4;
  ventana_n int;
  esperado  int;
  bloques_n int := 18;   -- bloques semanales de las 10 actividades activas
  tz_ok     timestamptz;
  tz_want   timestamptz;
  huerfanas int;
BEGIN
  esperado := bloques_n * semanas;   -- 18 × 4 = 72

  SELECT count(*) INTO ventana_n
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  JOIN schools sc ON sc.id = ac.school_id
  WHERE sc.slug = 'cidmi'
    AND cs.scheduled_start_at >= (dia_1::timestamp AT TIME ZONE 'America/Panama')
    AND cs.scheduled_start_at <  ((dia_1 + (semanas * 7))::timestamp AT TIME ZONE 'America/Panama');

  IF ventana_n <> esperado THEN
    RAISE EXCEPTION
      'Verificación: % sesiones en la ventana, esperaba %. Rollback.',
      ventana_n, esperado;
  END IF;

  -- Control de zona horaria: el primer martes del piloto (22 sep 2026) a las
  -- 2:30 PM de Panamá tiene que estar guardado como 19:30Z. Si esto falla, todas
  -- las sesiones están corridas de hora y Kassandra no ve sus clases.
  SELECT cs.scheduled_start_at INTO tz_ok
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  JOIN schools sc ON sc.id = ac.school_id
  WHERE sc.slug = 'cidmi'
    AND ac.name = 'Voleibol Primaria'
    AND cs.scheduled_start_at::date = date '2026-09-22';

  tz_want := timestamptz '2026-09-22 19:30:00+00';

  IF tz_ok IS DISTINCT FROM tz_want THEN
    RAISE EXCEPTION
      'Verificación de zona horaria: martes 2:30 PM Panamá quedó como %, esperaba % (19:30Z). Rollback.',
      tz_ok, tz_want;
  END IF;

  -- Ninguna sesión nueva puede haber caído en una actividad desactivada.
  SELECT count(*) INTO huerfanas
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  JOIN schools sc ON sc.id = ac.school_id
  WHERE sc.slug = 'cidmi'
    AND NOT ac.is_active
    AND cs.scheduled_start_at >= (dia_1::timestamp AT TIME ZONE 'America/Panama');

  IF huerfanas > 0 THEN
    RAISE EXCEPTION
      'Verificación: % sesiones en actividades desactivadas. Rollback.', huerfanas;
  END IF;
END $$;

-- ============================================================
-- 3. Reporte visible en Studio
-- ============================================================
-- Studio no muestra RAISE NOTICE y sólo renderiza el último statement.

WITH sc AS (SELECT id FROM schools WHERE slug = 'cidmi'),
ventana AS (
  SELECT ac.name AS activity_name, cs.scheduled_start_at, cs.scheduled_end_at
  FROM class_sessions cs
  JOIN activities ac ON ac.id = cs.activity_id
  JOIN sc ON sc.id = ac.school_id
  WHERE cs.scheduled_start_at >= (timestamp '2026-09-21 00:00' AT TIME ZONE 'America/Panama')
    AND cs.scheduled_start_at <  (timestamp '2026-10-19 00:00' AT TIME ZONE 'America/Panama')
),
lineas(ord, line) AS (
  SELECT 1, '=== TAREA 5 · SESIONES DEL PILOTO (21 sep - 18 oct 2026) ==='
  UNION ALL SELECT 2, format('sesiones creadas en la ventana: %s  (esperado 72 = 18 bloques/semana x 4)',
    (SELECT count(*) FROM ventana))
  UNION ALL SELECT 3, format('actividades con sesiones: %s  (esperado 10 — las 3 desactivadas no reciben)',
    (SELECT count(DISTINCT activity_name) FROM ventana))
  UNION ALL SELECT 4, format('primera: %s   ultima: %s   (hora de Panamá)',
    (SELECT to_char(min(scheduled_start_at) AT TIME ZONE 'America/Panama', 'Dy DD Mon HH24:MI') FROM ventana),
    (SELECT to_char(max(scheduled_start_at) AT TIME ZONE 'America/Panama', 'Dy DD Mon HH24:MI') FROM ventana))
  UNION ALL SELECT 5, format('control TZ — martes 22 sep, Voleibol Primaria 2:30 PM Panamá = %s  (esperado 19:30Z)',
    (SELECT to_char(scheduled_start_at AT TIME ZONE 'UTC', 'HH24:MI') || 'Z' FROM ventana
     WHERE activity_name = 'Voleibol Primaria' AND scheduled_start_at::date = date '2026-09-22'))
  UNION ALL SELECT 6, ''
  UNION ALL SELECT 7, '--- sesiones por actividad (esperado: 8 las de 2 bloques, 4 las de 1) ---'
  UNION ALL
  SELECT 10, format('%-26s %s sesiones', activity_name, count(*))
  FROM ventana GROUP BY activity_name
  UNION ALL SELECT 20, ''
  UNION ALL SELECT 21, '--- primera semana, en hora de Panamá ---'
  UNION ALL
  SELECT 30, format('%s  %-26s %s-%s',
                    to_char(scheduled_start_at AT TIME ZONE 'America/Panama', 'Dy DD Mon'),
                    activity_name,
                    to_char(scheduled_start_at AT TIME ZONE 'America/Panama', 'HH24:MI'),
                    to_char(scheduled_end_at   AT TIME ZONE 'America/Panama', 'HH24:MI'))
  FROM ventana
  WHERE scheduled_start_at < (timestamp '2026-09-28 00:00' AT TIME ZONE 'America/Panama')
)
SELECT line AS reporte FROM lineas ORDER BY ord, line;

COMMIT;

-- End of generate-class-sessions-sprint-3.sql
