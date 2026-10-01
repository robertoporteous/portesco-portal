-- supabase/scripts/seed-demo-feed.sql
-- Sprint 4 — Preview Tech Week. T1: events + news_items del Colegio Demo.
--
-- QUÉ HACE
--   6 eventos (2 partidos de liga, 1 torneo, 1 festival, 1 reunión de padres,
--   1 práctica especial) y 6 noticias (una de cada kind + un anuncio con link a
--   una tienda externa ficticia) en el colegio slug 'demo'.
--   Nombres de liga tomados de CIDMI (Liga Banco General) — no es PII.
--   Ningún texto menciona a un niño.
--
--   ⚠️ FECHAS: alrededor del demo del 11 oct 2026 (Fecha 3 de la liga = sábado
--   17 oct, según el brief). Roberto las ajusta en T7 con el calendario real de
--   la liga si cambian. image_url de la foto queda NULL hasta T7 (foto real de
--   PORTESCO sin caras de niños).
--
-- PRE-REQ: migración 0010 aplicada + seed-demo-school.sql corrido.
-- EJECUTAR EN: Supabase Studio SQL Editor.
-- IDEMPOTENTE: events y news_items no tienen unique → WHERE NOT EXISTS sobre
--   (school_id, title) (AGENTS §9).
-- BORRAR: cleanup-demo-school.sql (borra events/news del colegio demo).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.events') IS NULL OR to_regclass('public.news_items') IS NULL THEN
    RAISE EXCEPTION 'Pre-flight: falta la migración 0010 (events / news_items).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM schools WHERE slug = 'demo') THEN
    RAISE EXCEPTION 'Pre-flight: no existe el colegio demo. Corré seed-demo-school.sql.';
  END IF;
END $$;

-- ============================================================
-- 1. Eventos (hora local de Panamá → timestamptz)
-- ============================================================

INSERT INTO events (school_id, activity_id, title, description, event_type, starts_at, ends_at, location)
SELECT sc.id, ac.id, e.title, e.description, e.event_type::event_type,
       e.starts_local AT TIME ZONE 'America/Panama',
       e.ends_local   AT TIME ZONE 'America/Panama',
       e.location
FROM (VALUES
  ('Reunión de padres · Programa extracurricular',
   'Presentamos el plan del trimestre, el calendario de ligas y cómo seguir el avance de tu hijo en el Portal.',
   'meeting', timestamp '2026-10-08 18:00', timestamp '2026-10-08 19:00',
   'Auditorio del colegio', NULL),
  ('Liga Banco General · Fecha 2 · Fútbol Primaria',
   'Partido de liga. Llegada 30 minutos antes con uniforme completo.',
   'match', timestamp '2026-10-10 09:00', timestamp '2026-10-10 10:30',
   'Cancha sintética del colegio', 'Fútbol Primaria'),
  ('Práctica especial de Ajedrez · Simultánea con el profesor',
   'El profesor juega contra todo el grupo a la vez. Abierta a padres como público.',
   'practice', timestamp '2026-10-14 14:30', timestamp '2026-10-14 16:00',
   'Biblioteca', 'Ajedrez Primaria'),
  ('Liga Banco General · Fecha 3 · Fútbol Secundaria',
   'Partido de liga como visitantes. Transporte saliendo del colegio a las 7:30 AM.',
   'match', timestamp '2026-10-17 09:00', timestamp '2026-10-17 10:30',
   'Cancha visitante (por confirmar)', 'Fútbol Secundaria'),
  ('Torneo Interescolar de Voleibol Primaria',
   'Torneo de un día con cuatro colegios. Traer hidratación y merienda.',
   'tournament', timestamp '2026-10-24 08:00', timestamp '2026-10-24 14:00',
   'Gimnasio del colegio', 'Voleibol Primaria'),
  ('Festival de fin de trimestre',
   'Muestra de Baile Urbano, partidos amistosos y premiación. Toda la familia está invitada.',
   'festival', timestamp '2026-10-30 15:00', timestamp '2026-10-30 18:00',
   'Patio central', NULL)
) AS e(title, description, event_type, starts_local, ends_local, location, activity_name)
JOIN schools sc ON sc.slug = 'demo'
LEFT JOIN activities ac ON ac.school_id = sc.id AND ac.name = e.activity_name
WHERE NOT EXISTS (
  SELECT 1 FROM events x WHERE x.school_id = sc.id AND x.title = e.title
);

-- ============================================================
-- 2. Noticias (una por kind + anuncio con link externo)
-- ============================================================

INSERT INTO news_items (school_id, activity_id, kind, title, body, image_url, link_url, link_label, published_at)
SELECT sc.id, ac.id, n.kind::news_kind, n.title, n.body,
       CASE WHEN n.kind = 'photo' THEN '/images/equipo-portesco.jpg' END,
       n.link_url, n.link_label,
       now() - n.age
FROM (VALUES
  ('result', 'Fútbol Secundaria 3 – 1 Colegio Visitante',
   'Victoria en la Semana 2 de la Liga FCC. Gran trabajo en equipo y buena actitud de todo el grupo.',
   NULL, NULL, interval '5 days', 'Fútbol Secundaria'),
  ('photo', 'Conoce al equipo PORTESCO',
   'Roberto y Alejandra, fundadores de PORTESCO. Detrás de cada programa hay un equipo que coordina, acompaña y da seguimiento a tu hijo.',
   NULL, NULL, interval '3 days', NULL),
  ('announcement', 'Calendario de la Liga FCC Sub 18 Masculina',
   'Ya están publicadas las semanas 3 a 6, los cuartos de final, semifinal y final. Revisa la sección Calendario para ver horarios y canchas.',
   NULL, NULL, interval '2 days', NULL),
  ('payment_reminder', 'Recordatorio: pago de octubre',
   'El pago mensual de las actividades vence el 10 de octubre. Puedes pagar por Yappy o transferencia desde tu Perfil.',
   NULL, NULL, interval '1 day', NULL),
  ('promo', 'Inscripciones abiertas: Ajedrez',
   'Quedan cupos en Ajedrez Primaria, viernes de 2:30 a 4:00 PM. Habla con la coordinación para inscribir a tu hijo.',
   NULL, NULL, interval '12 hours', 'Ajedrez Primaria'),
  ('announcement', 'Nuevos uniformes disponibles',
   'Los uniformes oficiales de la temporada ya están a la venta en la tienda en línea.',
   'https://example.com/tienda-portesco', 'Tienda PORTESCO', interval '2 hours', NULL)
) AS n(kind, title, body, link_url, link_label, age, activity_name)
JOIN schools sc ON sc.slug = 'demo'
LEFT JOIN activities ac ON ac.school_id = sc.id AND ac.name = n.activity_name
WHERE NOT EXISTS (
  SELECT 1 FROM news_items x WHERE x.school_id = sc.id AND x.title = n.title
);

-- ============================================================
-- 3. Verificación + reporte
-- ============================================================

DO $$
DECLARE
  n_ev int; n_nw int; n_kinds int;
BEGIN
  SELECT count(*) INTO n_ev FROM events e JOIN schools s ON s.id = e.school_id WHERE s.slug = 'demo';
  SELECT count(*), count(DISTINCT kind) INTO n_nw, n_kinds
  FROM news_items n JOIN schools s ON s.id = n.school_id WHERE s.slug = 'demo';
  IF n_ev <> 6 OR n_nw <> 6 OR n_kinds <> 5 THEN
    RAISE EXCEPTION 'Verificación: events=% (6), news=% (6), kinds=% (5). Rollback.', n_ev, n_nw, n_kinds;
  END IF;
END $$;

SELECT format('%s · %s · %s', 'event', e.event_type,
              to_char(e.starts_at AT TIME ZONE 'America/Panama', 'Dy DD Mon HH24:MI') || ' ' || e.title) AS reporte
FROM events e JOIN schools s ON s.id = e.school_id WHERE s.slug = 'demo'
UNION ALL
SELECT format('%s · %s · %s', 'news', n.kind, n.title)
FROM news_items n JOIN schools s ON s.id = n.school_id WHERE s.slug = 'demo';

COMMIT;

-- End of seed-demo-feed.sql
