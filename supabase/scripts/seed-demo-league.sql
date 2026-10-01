-- supabase/scripts/seed-demo-league.sql
-- Sprint 4 — T7. Calendario REAL de la Liga FCC Sub 18 Masculina 2026 (flag
-- football) como eventos del Colegio Demo, atados a la actividad "Flag Football
-- Secundaria" (seed-demo-school.sql, T7). Fuente: FCC_U18_M_2026.pdf.
-- Equipos y canchas son los de la liga (colegios, no personas) — no es PII.
--
-- Reemplaza los dos eventos genéricos "Liga Banco General · Fecha N" del
-- seed-demo-feed.sql. Idempotente: WHERE NOT EXISTS por (school, title).
-- PRE-REQ: 0010 + seed-demo-school.sql (con Flag Football Secundaria).

BEGIN;

DELETE FROM events
WHERE school_id = (SELECT id FROM schools WHERE slug = 'demo')
  AND title LIKE 'Liga Banco General%';

UPDATE news_items
SET title = 'Calendario de la Liga FCC Sub 18 Masculina',
    body  = 'Ya están publicadas las semanas 3 a 6, los cuartos de final, semifinal y final. Revisa la sección Calendario para ver horarios y canchas.'
WHERE school_id = (SELECT id FROM schools WHERE slug = 'demo')
  AND title = 'Calendario de la Liga Banco General';

UPDATE news_items
SET title = 'Conoce al equipo PORTESCO',
    body = 'Roberto y Alejandra, fundadores de PORTESCO. Detrás de cada programa hay un equipo que coordina, acompaña y da seguimiento a tu hijo.',
    image_url = '/images/equipo-portesco.jpg',
    activity_id = NULL
WHERE school_id = (SELECT id FROM schools WHERE slug = 'demo')
  AND kind = 'photo';

UPDATE news_items
SET body = 'Victoria en la Semana 2 de la Liga FCC. Gran trabajo en equipo y buena actitud de todo el grupo.'
WHERE school_id = (SELECT id FROM schools WHERE slug = 'demo')
  AND kind = 'result';

INSERT INTO events (school_id, activity_id, title, description, event_type, starts_at, ends_at, location)
SELECT sc.id, ac.id, e.title, e.description, e.event_type::event_type,
       e.starts_local AT TIME ZONE 'America/Panama',
       e.ends_local   AT TIME ZONE 'America/Panama',
       e.location
FROM (VALUES
  ('Liga FCC Sub 18 · Semana 3',
   '6:50 PM ECP White vs AIP · 6:50 PM Brader vs ECP Black · 6:50 PM ECP Green vs SAP. Llegar 30 min antes con uniforme completo.',
   'match', timestamp '2026-10-03 18:50', timestamp '2026-10-03 20:00', 'CDE SC'),
  ('Liga FCC Sub 18 · Semana 4',
   '6:00 PM ECP Black vs AIP · 6:50 PM ECP Green vs Brader · 6:50 PM La Salle vs ECP White.',
   'match', timestamp '2026-10-10 18:00', timestamp '2026-10-10 20:00', 'CDE SC'),
  ('Liga FCC Sub 18 · Semana 5 (entre semana)',
   '4:00 PM AIP vs ECP Green · 5:00 PM Brader vs ECP White. Jornada de jueves en ECP.',
   'match', timestamp '2026-10-15 16:00', timestamp '2026-10-15 18:00', 'ECP'),
  ('Liga FCC Sub 18 · Semana 6',
   '6:30 AM AIP vs Brader · 6:30 AM La Salle vs ECP Green · 6:30 AM SAP vs ECP Black. Última jornada regular.',
   'match', timestamp '2026-10-17 06:30', timestamp '2026-10-17 08:30', 'CDE SC'),
  ('Liga FCC Sub 18 · Cuartos de final',
   '6:00 AM #2 vs #7 · 6:50 AM #3 vs #6 · 6:50 AM #4 vs #5. Los cruces se definen con la tabla final de la Semana 6.',
   'tournament', timestamp '2026-10-24 06:00', timestamp '2026-10-24 08:30', 'CDE SC'),
  ('Liga FCC Sub 18 · Semifinales',
   '#1 vs lower seed · Ganador de cuartos vs ganador de cuartos. Hora por confirmar.',
   'tournament', timestamp '2026-11-14 08:00', timestamp '2026-11-14 11:00', 'CDE SC'),
  ('Liga FCC Sub 18 · Final y 3er lugar',
   '3er lugar: perdedor SF1 vs perdedor SF2 · Final: ganador SF1 vs ganador SF2. Hora por confirmar.',
   'tournament', timestamp '2026-11-21 08:00', timestamp '2026-11-21 11:00', 'CDE SC')
) AS e(title, description, event_type, starts_local, ends_local, location)
JOIN schools sc ON sc.slug = 'demo'
LEFT JOIN activities ac ON ac.school_id = sc.id AND ac.name = 'Flag Football Secundaria'
WHERE NOT EXISTS (
  SELECT 1 FROM events x WHERE x.school_id = sc.id AND x.title = e.title
);

SELECT format('eventos demo: %s · liga FCC: %s · foto con imagen: %s',
  (SELECT count(*) FROM events WHERE school_id = (SELECT id FROM schools WHERE slug = 'demo')),
  (SELECT count(*) FROM events WHERE school_id = (SELECT id FROM schools WHERE slug = 'demo') AND title LIKE 'Liga FCC%'),
  (SELECT count(*) FROM news_items WHERE school_id = (SELECT id FROM schools WHERE slug = 'demo') AND image_url IS NOT NULL)
) AS reporte;

COMMIT;
