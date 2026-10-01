-- Sprint 4 T8 — precios y cupos ficticios para el catálogo del Colegio Demo.
-- Idempotente. Solo toca actividades del colegio slug 'demo'.
-- Correr en Supabase Studio (pbcopy < este archivo → Run).

UPDATE activities a
SET monthly_price = v.price, max_students = v.max_s, min_students = v.min_s
FROM (VALUES
  ('Fútbol Primaria',          45.00, 20, 8),
  ('Fútbol Secundaria',        45.00, 20, 8),
  ('Voleibol Primaria',        45.00, 16, 8),
  ('Basketball Primaria',      45.00, 16, 8),
  ('Baile Urbano Primaria',    40.00, 15, 6),
  ('Ajedrez Primaria',         35.00, 12, 5),
  ('Flag Football Secundaria', 50.00, 18, 10)
) AS v(name, price, max_s, min_s)
JOIN schools sc ON sc.slug = 'demo'
WHERE a.school_id = sc.id AND a.name = v.name;

SELECT a.name, a.monthly_price, a.min_students, a.max_students
FROM activities a JOIN schools sc ON sc.id = a.school_id
WHERE sc.slug = 'demo' ORDER BY a.category, a.name;
