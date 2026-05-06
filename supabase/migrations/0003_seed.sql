-- 0003_seed.sql
-- PORTESCO Portal — Sprint 1 demo seed.
--
-- Pre-requisite: an auth.users row for roberto.porteous.bim@gmail.com must
-- already exist. Create it from the Supabase Dashboard:
--   Authentication → Users → Add user → Create new user
--     - email:              roberto.porteous.bim@gmail.com
--     - password:           any value (≥6 chars; never used — login is via magic link)
--     - Auto Confirm User:  ON
--
-- This file resolves the auth.users id by email (NOT by hardcoded UUID) so
-- the seed stays reproducible across project resets.
--
-- Run this in the Supabase Studio SQL Editor — the editor authenticates as
-- service_role, which bypasses RLS. The seed is wrapped in a single
-- transaction; any failure rolls everything back.
--
-- Idempotent: re-running on top of an existing seed is a no-op.

begin;

-- ============================================================
-- Pre-flight: refuse to seed if the auth user is missing.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from auth.users where email = 'roberto.porteous.bim@gmail.com'
  ) then
    raise exception
      'Seed precondition failed: auth.users row for roberto.porteous.bim@gmail.com '
      'does not exist. Create it via Dashboard → Authentication → Users → Add user '
      '(Auto Confirm: ON) before running this seed.';
  end if;
end $$;

-- ============================================================
-- 1. School: Colegio María Inmaculada (CIDMI)
-- ============================================================

insert into schools (name, slug, primary_color, secondary_color, yappy_handle, is_active)
values (
  'Colegio María Inmaculada',
  'cidmi',
  '#1E3A8A',
  '#E31E24',
  '@Portescosports',
  true
)
on conflict (slug) do nothing;

-- ============================================================
-- 2. public.users mirror for Roberto (parent + admin override)
-- ============================================================
-- Decision A: role='parent' is the primary identity, is_admin=true is the
-- override that grants global access via RLS policies.

insert into users (id, email, full_name, role, is_admin, is_active)
select
  au.id,
  'roberto.porteous.bim@gmail.com',
  'Roberto Porteous',
  'parent'::user_role,
  true,
  true
from auth.users au
where au.email = 'roberto.porteous.bim@gmail.com'
on conflict (email) do nothing;

-- ============================================================
-- 3. Four CIDMI activities
-- ============================================================
-- No unique constraint exists on (school_id, name), so we guard with
-- NOT EXISTS instead of ON CONFLICT. Times are stored as Panama-local
-- in `time` columns (no timezone); the `schedule` column carries the
-- human-friendly Spanish label for display.

insert into activities (
  school_id, name, category, monthly_price, schedule, days_of_week, start_time, end_time
)
select
  s.id,
  v.name,
  v.category::activity_category,
  v.monthly_price,
  v.schedule,
  v.days_of_week,
  v.start_time::time,
  v.end_time::time
from schools s
cross join (values
  ('Fútbol',     'deporte',   25, 'Lunes y miércoles 3:00-4:00 PM', array['lunes', 'miercoles'], '15:00', '16:00'),
  ('Basketball', 'deporte',   30, 'Martes y jueves 3:00-4:00 PM',   array['martes', 'jueves'],   '15:00', '16:00'),
  ('Atletismo',  'deporte',   25, 'Viernes 3:00-4:30 PM',           array['viernes'],            '15:00', '16:30'),
  ('Ajedrez',    'academico', 25, 'Lunes 3:00-4:00 PM',             array['lunes'],              '15:00', '16:00')
) as v(name, category, monthly_price, schedule, days_of_week, start_time, end_time)
where s.slug = 'cidmi'
  and not exists (
    select 1 from activities a
    where a.school_id = s.id and a.name = v.name
  );

-- ============================================================
-- 4. One demo student linked to Roberto
-- ============================================================

insert into students (school_id, parent_id, full_name, grade, date_of_birth, is_active)
select
  s.id,
  u.id,
  'Estudiante Demo Porteous',
  '5to',
  null,
  true
from schools s
join users u on u.email = 'roberto.porteous.bim@gmail.com'
where s.slug = 'cidmi'
  and not exists (
    select 1 from students st
    where st.school_id = s.id
      and st.parent_id = u.id
      and st.full_name = 'Estudiante Demo Porteous'
  );

-- ============================================================
-- 5. Two enrollments: Fútbol + Ajedrez
-- ============================================================

insert into enrollments (student_id, activity_id, status)
select
  st.id,
  a.id,
  'active'::enrollment_status
from students   st
join schools    s on s.id = st.school_id
join activities a on a.school_id = s.id
where s.slug = 'cidmi'
  and st.full_name = 'Estudiante Demo Porteous'
  and a.name in ('Fútbol', 'Ajedrez')
on conflict (student_id, activity_id) do nothing;

-- ============================================================
-- Verification: NOTICE-level output, before commit.
-- Expected after a fresh run: 1 / 1 / 4 / 1 / 2
-- ============================================================

do $$
declare
  schools_count     int;
  users_count       int;
  activities_count  int;
  students_count    int;
  enrollments_count int;
begin
  select count(*) into schools_count
    from schools where slug = 'cidmi';

  select count(*) into users_count
    from users where email = 'roberto.porteous.bim@gmail.com';

  select count(*) into activities_count
    from activities a join schools s on s.id = a.school_id
    where s.slug = 'cidmi';

  select count(*) into students_count
    from students st join schools s on s.id = st.school_id
    where s.slug = 'cidmi';

  select count(*) into enrollments_count
    from enrollments e
    join students st on st.id = e.student_id
    join schools  s  on s.id  = st.school_id
    where s.slug = 'cidmi';

  raise notice 'Seed verification — schools=% users=% activities=% students=% enrollments=%',
    schools_count, users_count, activities_count, students_count, enrollments_count;
end $$;

commit;

-- End of 0003_seed.sql
