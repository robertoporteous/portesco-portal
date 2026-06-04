-- supabase/scripts/seed-cidmi-pilot-sprint-2.sql
-- Sprint 2 — Coordinator Pad + Voice→Perfil Acumulativo→Reporte Bi-semanal
-- CIDMI piloto Sprint 2: Alexander Watson cubre Fútbol U14+U16+U18 (~36 niños)
--
-- DATOS:
--   - 36 estudiantes (14 U14 + 11 U16 + 11 U18) de la lista operativa CIDMI 2026
--   - 23 con padres reales (cruzados con Formulario Extracurricular 2026)
--   - 13 con parent placeholder (Roberto) — Sprint 3 reasigna cuando Kassandra confirme
--   - Tabla auxiliar `_pilot_parent_contacts` guarda contactos reales para invitaciones Sprint 3
--
-- PRE-FLIGHT (crear MANUALMENTE en Supabase Dashboard → Authentication → Add user):
--   1. roberto.porteous.bim@gmail.com (ya existe desde Sprint 1, no recrear)
--   2. kdossantos166@gmail.com — Kassandra Dos Santos (coordinator)
--   3. Portescosport@gmail.com — Alexander Watson (professor)
--   Auto Confirm: ON para todos. Password cualquiera (login es magic link).
--
-- EJECUTAR EN: Supabase Studio SQL Editor (service_role bypass RLS).
-- IDEMPOTENTE: re-run safe (ON CONFLICT DO NOTHING en todo).

BEGIN;

-- ============================================================
-- 0. Pre-flight: refuse to seed if auth users missing
-- ============================================================

DO $$
DECLARE
  missing_emails text;
BEGIN
  SELECT string_agg(missing, ', ') INTO missing_emails
  FROM (VALUES
    ('roberto.porteous.bim@gmail.com'),
    ('kdossantos166@gmail.com'),
    ('Portescosport@gmail.com')
  ) AS expected(missing)
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(expected.missing)
  );

  IF missing_emails IS NOT NULL THEN
    RAISE EXCEPTION
      'Seed precondition failed: missing auth.users for: %. '
      'Create them via Dashboard → Authentication → Users → Add user (Auto Confirm: ON).',
      missing_emails;
  END IF;
END $$;

-- ============================================================
-- 1. Actividad nueva: Fútbol U14-U18 (piloto Sprint 2 con Alexander)
-- ============================================================
-- La actividad "Fútbol" genérica del seed 0003 sigue existiendo para otros usos.
-- "Fútbol U14-U18" es la actividad específica del piloto Sprint 2.

INSERT INTO activities (
  school_id, name, category, monthly_price, schedule, days_of_week, start_time, end_time
)
SELECT
  s.id,
  'Fútbol U14-U18',
  'deporte'::activity_category,
  35,
  'Martes y jueves 5:00-6:30 PM',
  array['martes', 'jueves'],
  '17:00'::time,
  '18:30'::time
FROM schools s
WHERE s.slug = 'cidmi'
  AND NOT EXISTS (
    SELECT 1 FROM activities a
    WHERE a.school_id = s.id AND a.name = 'Fútbol U14-U18'
  );

-- ============================================================
-- 2. Kassandra (coordinator) — public.users mirror + staff_schools link
-- ============================================================

INSERT INTO users (id, email, full_name, phone, role, is_admin, is_active)
SELECT
  au.id,
  'kdossantos166@gmail.com',
  'Kassandra Dos Santos',
  NULL,
  'coordinator'::user_role,
  false,
  true
FROM auth.users au
WHERE lower(au.email) = 'kdossantos166@gmail.com'
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff_schools (user_id, school_id, role)
SELECT u.id, s.id, 'coordinator'::user_role
FROM users u
CROSS JOIN schools s
WHERE u.email = 'kdossantos166@gmail.com'
  AND s.slug = 'cidmi'
ON CONFLICT (user_id, school_id) DO NOTHING;

-- ============================================================
-- 3. Alexander Watson (professor) — public.users + staff_schools + staff_activities
-- ============================================================

INSERT INTO users (id, email, full_name, phone, role, is_admin, is_active)
SELECT
  au.id,
  lower('Portescosport@gmail.com'),
  'Alexander Watson',
  NULL,
  'professor'::user_role,
  false,
  true
FROM auth.users au
WHERE lower(au.email) = lower('Portescosport@gmail.com')
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff_schools (user_id, school_id, role)
SELECT u.id, s.id, 'professor'::user_role
FROM users u
CROSS JOIN schools s
WHERE u.email = lower('Portescosport@gmail.com')
  AND s.slug = 'cidmi'
ON CONFLICT (user_id, school_id) DO NOTHING;

INSERT INTO staff_activities (user_id, activity_id)
SELECT u.id, a.id
FROM users u
JOIN schools s ON s.slug = 'cidmi'
JOIN activities a ON a.school_id = s.id AND a.name = 'Fútbol U14-U18'
WHERE u.email = lower('Portescosport@gmail.com')
ON CONFLICT (user_id, activity_id) DO NOTHING;

-- ============================================================
-- 4. Tabla auxiliar _pilot_parent_contacts (Sprint 2-only)
-- ============================================================
-- Guarda contactos reales de padres del piloto.
-- Sprint 3: usa esta tabla para enviar invitaciones, crear auth.users reales,
-- y actualizar students.parent_id al padre real.
-- DROP esta tabla cuando todos los padres estén invitados (post-Sprint 3).

CREATE TABLE IF NOT EXISTS _pilot_parent_contacts (
  id              uuid primary key default gen_random_uuid(),
  student_full_name text not null,
  group_label     text not null,
  parent_name     text,
  parent_email    text,
  parent_phone    text,
  source          text not null,
  invited_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (student_full_name, group_label)
);
ALTER TABLE _pilot_parent_contacts ENABLE ROW LEVEL SECURITY;
-- Solo admin lee (Roberto). Sin policies parent/coordinator porque es tabla operativa interna.
DROP POLICY IF EXISTS pilot_parent_contacts_admin_read ON _pilot_parent_contacts;
CREATE POLICY pilot_parent_contacts_admin_read ON _pilot_parent_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

INSERT INTO _pilot_parent_contacts (student_full_name, group_label, parent_name, parent_email, parent_phone, source) VALUES
  ('Carlos Pineda', 'U14', 'Patricia Martínez', 'martinezdpatricia31@gmail.com', '62512978', 'formulario_2026'),
  ('Gialuca Bravo', 'U14', NULL, NULL, NULL, 'unmatched_pending'),
  ('Sergio Solorzano', 'U14', 'LICETH PAREDES', 'juansolorzano18@gmail.com', '66740914', 'formulario_2026'),
  ('Juan Jose Rincon', 'U14', 'Alfonso Rincon', '3rincon@gmail.com', '65701170', 'formulario_2026'),
  ('Javier Beliz', 'U14', 'Javier Béliz Rodriguez', 'javitinb@hotmail.com', '69489322', 'formulario_2026'),
  ('Matias Galaviz', 'U14', NULL, NULL, NULL, 'unmatched_pending'),
  ('Ian De Frias', 'U14', 'Elisdeth Quiel', 'elisdethquiel20@hotmail.com', '64477662', 'formulario_2026'),
  ('Gabriel Arias', 'U14', 'Emir Arias Pérez', 'emiralejo@gmail.com', '62332404', 'formulario_2026'),
  ('Diego Chiari', 'U14', 'Ramon Chiari', 'rjchiari@hotmail.com', '67804222', 'formulario_2026'),
  ('Carlos Paredes', 'U14', 'Soraiza Villalobos', 'soraizaads@gmail.com', '67790429', 'formulario_2026'),
  ('Juan Diego Guerra', 'U14', 'Alcides Guerra', 'akarina@gbm.net', '66850706', 'formulario_2026'),
  ('Mauricio Adrian', 'U14', 'Aggi Torres', 'aggi.torres@gmail.com', '50765588814', 'formulario_2026'),
  ('Alvaro Sanchez', 'U14', 'Dyalis Suárez', 'dyalis.suarez@gmail.com', '60793987', 'formulario_2026'),
  ('Daniel Izquierdo', 'U14', NULL, NULL, NULL, 'unmatched_pending'),
  ('Rene Halphen', 'U16', 'Maritzel Giroldi', 'mmgp10@yahoo.com', '64645174', 'formulario_2026'),
  ('Alejandro Sanchez', 'U16', 'Dyalis Suárez', 'dyalis.suarez@gmail.com', '60793987', 'formulario_2026'),
  ('Jan Upacky', 'U16', 'Elmis Damaris Cano Gutiérrez', 'elmiscanog@gmail.com', '67117083', 'formulario_2026'),
  ('Javier Castillo', 'U16', 'ROsema Silvera, Javier Castillo', 'rosema.silvera@gmail.com', '64492163', 'formulario_2026'),
  ('Luis Garces', 'U16', 'Diorelis Valdes', 'degarciadiorelis@gmail.com', '66650770', 'formulario_2026'),
  ('Felipe Gutierrez', 'U16', 'Analeydis Vergara', 'analeydis.vergara@gmail.com', '65278631', 'formulario_2026'),
  ('Sebastian Saavedra', 'U16', 'Hector Saavedra', 'arqhsaavedra@gmail.com', '61483403', 'formulario_2026'),
  ('Dustin Sanchez', 'U16', NULL, NULL, NULL, 'unmatched_pending'),
  ('Alejandro Gomez', 'U16', NULL, NULL, NULL, 'unmatched_pending'),
  ('Eduardo Izquierdo', 'U16', NULL, NULL, NULL, 'unmatched_pending'),
  ('Diego Vivas', 'U16', NULL, NULL, NULL, 'unmatched_pending'),
  ('Giancarlo Marin', 'U18', 'Jacqueline Marín', 'jacmichelle.9@hotmail.com', '60566338', 'formulario_2026'),
  ('Victor Palumbo', 'U18', NULL, NULL, NULL, 'unmatched_pending'),
  ('Boris Castillo', 'U18', NULL, NULL, NULL, 'unmatched_pending'),
  ('Santiago Adrian', 'U18', 'Aggi Torres', 'aggi.torres@gmail.com', '65588814', 'formulario_2026'),
  ('Andree Gutierrez', 'U18', 'Analeydis Vergara', 'analeydis.vergara@gmail.com', '65278631', 'formulario_2026'),
  ('Julio Vargas', 'U18', 'Julio Vargas', 'trsnails@gmail.com', '63626898', 'formulario_2026'),
  ('Jean Franco Branch', 'U18', NULL, NULL, NULL, 'unmatched_pending'),
  ('Sergio Salomon', 'U18', NULL, NULL, NULL, 'unmatched_pending'),
  ('Samuel Malave', 'U18', NULL, NULL, NULL, 'unmatched_pending'),
  ('Emiliano Castillo', 'U18', NULL, NULL, NULL, 'unmatched_pending'),
  ('Juan David De la Guardia', 'U18', 'Miriam Quintero', 'miriamdelc@gmail.com', '66752050', 'formulario_2026')
ON CONFLICT (student_full_name, group_label) DO NOTHING;

-- ============================================================
-- 5. 36 students con parent_id = Roberto (placeholder Sprint 2)
-- ============================================================
-- En Sprint 2 (parent_visible=false hardcoded) los padres NO entran al portal.
-- parent_id = Roberto es un placeholder técnico para satisfacer la FK constraint.
-- Sprint 3 (Sprint del Padre) reasigna parent_id al padre real (joins via _pilot_parent_contacts).

INSERT INTO students (school_id, parent_id, full_name, grade, is_active)
SELECT s.id, u.id, kid.full_name, kid.grade, true
FROM schools s
CROSS JOIN users u
CROSS JOIN (VALUES
  ('Carlos Pineda', '7mo', 'U14'),
  ('Gialuca Bravo', '7mo', 'U14'),
  ('Sergio Solorzano', '7mo', 'U14'),
  ('Juan Jose Rincon', '7mo', 'U14'),
  ('Javier Beliz', '7mo', 'U14'),
  ('Matias Galaviz', '7mo', 'U14'),
  ('Ian De Frias', '7mo', 'U14'),
  ('Gabriel Arias', '7mo', 'U14'),
  ('Diego Chiari', '7mo', 'U14'),
  ('Carlos Paredes', '7mo', 'U14'),
  ('Juan Diego Guerra', '7mo', 'U14'),
  ('Mauricio Adrian', '7mo', 'U14'),
  ('Alvaro Sanchez', '7mo', 'U14'),
  ('Daniel Izquierdo', '7mo', 'U14'),
  ('Rene Halphen', '9no', 'U16'),
  ('Alejandro Sanchez', '9no', 'U16'),
  ('Jan Upacky', '9no', 'U16'),
  ('Javier Castillo', '9no', 'U16'),
  ('Luis Garces', '9no', 'U16'),
  ('Felipe Gutierrez', '9no', 'U16'),
  ('Sebastian Saavedra', '9no', 'U16'),
  ('Dustin Sanchez', '9no', 'U16'),
  ('Alejandro Gomez', '9no', 'U16'),
  ('Eduardo Izquierdo', '9no', 'U16'),
  ('Diego Vivas', '9no', 'U16'),
  ('Giancarlo Marin', '11vo', 'U18'),
  ('Victor Palumbo', '11vo', 'U18'),
  ('Boris Castillo', '11vo', 'U18'),
  ('Santiago Adrian', '11vo', 'U18'),
  ('Andree Gutierrez', '11vo', 'U18'),
  ('Julio Vargas', '11vo', 'U18'),
  ('Jean Franco Branch', '11vo', 'U18'),
  ('Sergio Salomon', '11vo', 'U18'),
  ('Samuel Malave', '11vo', 'U18'),
  ('Emiliano Castillo', '11vo', 'U18'),
  ('Juan David De la Guardia', '11vo', 'U18')
) AS kid(full_name, grade, group_label)
WHERE s.slug = 'cidmi'
  AND u.email = 'roberto.porteous.bim@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM students st
    WHERE st.school_id = s.id AND st.full_name = kid.full_name
  );

-- ============================================================
-- 6. Enrollments — los 36 niños a Fútbol U14-U18
-- ============================================================

INSERT INTO enrollments (student_id, activity_id, status)
SELECT
  st.id,
  a.id,
  'active'::enrollment_status
FROM students st
JOIN schools s ON s.id = st.school_id
JOIN activities a ON a.school_id = s.id AND a.name = 'Fútbol U14-U18'
JOIN _pilot_parent_contacts c ON c.student_full_name = st.full_name
WHERE s.slug = 'cidmi'
ON CONFLICT (student_id, activity_id) DO NOTHING;

-- ============================================================
-- 7. Verification (NOTICE-level, antes del commit)
-- ============================================================

DO $$
DECLARE
  kassandra_ok       boolean;
  alexander_ok       boolean;
  alexander_activity boolean;
  activity_count     int;
  contacts_count     int;
  students_count     int;
  enrollments_count  int;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM staff_schools ss
    JOIN users u ON u.id = ss.user_id
    JOIN schools s ON s.id = ss.school_id
    WHERE u.email = 'kdossantos166@gmail.com' AND s.slug = 'cidmi' AND ss.role = 'coordinator'
  ) INTO kassandra_ok;

  SELECT EXISTS(
    SELECT 1 FROM staff_schools ss
    JOIN users u ON u.id = ss.user_id
    JOIN schools s ON s.id = ss.school_id
    WHERE u.email = lower('Portescosport@gmail.com') AND s.slug = 'cidmi' AND ss.role = 'professor'
  ) INTO alexander_ok;

  SELECT EXISTS(
    SELECT 1 FROM staff_activities sa
    JOIN users u ON u.id = sa.user_id
    JOIN activities a ON a.id = sa.activity_id
    WHERE u.email = lower('Portescosport@gmail.com') AND a.name = 'Fútbol U14-U18'
  ) INTO alexander_activity;

  SELECT count(*) INTO activity_count FROM activities a JOIN schools s ON s.id = a.school_id WHERE s.slug = 'cidmi' AND a.name = 'Fútbol U14-U18';
  SELECT count(*) INTO contacts_count FROM _pilot_parent_contacts;
  SELECT count(*) INTO students_count FROM students st JOIN _pilot_parent_contacts c ON c.student_full_name = st.full_name;
  SELECT count(*) INTO enrollments_count FROM enrollments e JOIN activities a ON a.id = e.activity_id WHERE a.name = 'Fútbol U14-U18';

  RAISE NOTICE 'Seed CIDMI Sprint 2 — kassandra=% alexander=% alexander_activity=% futbol_u14_u18=% contacts=% students=% enrollments=%',
    kassandra_ok, alexander_ok, alexander_activity, activity_count, contacts_count, students_count, enrollments_count;
  RAISE NOTICE 'Expected: t / t / t / 1 / 36 / 36 / 36';
END $$;

COMMIT;

-- End of seed-cidmi-pilot-sprint-2.sql
