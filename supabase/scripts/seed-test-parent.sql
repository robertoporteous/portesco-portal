-- seed-test-parent.sql
-- Test fixture for Sprint 1 Bloque 2 acceptance criterion #10:
-- RLS isolation between parents — a parent-only user must not see
-- another parent's children.
--
-- This is NOT a migration. Do not number it. Run it manually from the
-- Supabase Dashboard → SQL Editor whenever the test parent state needs
-- to be (re)created. Idempotent: safe to run multiple times.
--
-- Preconditions:
--   1. ai@portescosports.com has signed in at least once via magic link,
--      so auth.users has a row for that email. The script reads its id
--      and refuses to run if the row is absent.
--   2. The CIDMI school exists in public.schools (loaded by 0003_seed.sql).
--   3. Activities "Basketball" and "Atletismo" exist in public.activities
--      for CIDMI (loaded by 0003_seed.sql).
--
-- Result:
--   public.users        +1 (parent role, is_admin=false)
--   public.students     +1 ("Ana Mendoza", grade 4to, CIDMI)
--   public.enrollments  +2 (Basketball + Atletismo, both active)
--
-- Roberto's admin account (roberto.porteous.bim@gmail.com) is untouched.
-- The test parent's child is intentionally distinct from Roberto's seed
-- child so RLS isolation is visually obvious in the parent dashboard.

do $$
declare
  v_auth_uid     uuid;
  v_school_id    uuid;
  v_student_id   uuid;
  v_enrollments  int;
begin
  -- 1. Locate the auth.users row created by the magic-link sign-in.
  select id into v_auth_uid
  from auth.users
  where email = 'ai@portescosports.com';

  if v_auth_uid is null then
    raise exception
      'auth.users row for ai@portescosports.com not found. '
      'Sign in once via /login magic link, then re-run this script.';
  end if;

  -- 2. Locate the CIDMI school.
  select id into v_school_id
  from public.schools
  where slug = 'cidmi';

  if v_school_id is null then
    raise exception 'CIDMI school not found in public.schools.';
  end if;

  -- 3. Upsert the public.users row as a parent (not admin).
  insert into public.users (id, email, full_name, role, is_admin, is_active)
  values (
    v_auth_uid,
    'ai@portescosports.com',
    'Carolina Mendoza',
    'parent',
    false,
    true
  )
  on conflict (id) do update
    set role     = excluded.role,
        is_admin = excluded.is_admin,
        is_active = excluded.is_active;

  -- 4. Find-or-create the student linked to this parent.
  --    No natural unique key on (parent_id, full_name), so we look first.
  select id into v_student_id
  from public.students
  where parent_id = v_auth_uid
    and full_name = 'Ana Mendoza';

  if v_student_id is null then
    insert into public.students (school_id, parent_id, full_name, grade, is_active)
    values (v_school_id, v_auth_uid, 'Ana Mendoza', '4to', true)
    returning id into v_student_id;
  end if;

  -- 5. Enroll Ana in Basketball + Atletismo (idempotent via unique constraint).
  insert into public.enrollments (student_id, activity_id, status)
  select v_student_id, a.id, 'active'::enrollment_status
  from public.activities a
  where a.school_id = v_school_id
    and a.name in ('Basketball', 'Atletismo')
  on conflict (student_id, activity_id) do nothing;

  select count(*) into v_enrollments
  from public.enrollments
  where student_id = v_student_id and status = 'active';

  raise notice 'Test parent fixture ready';
  raise notice '  parent.id      = %', v_auth_uid;
  raise notice '  student.id     = %', v_student_id;
  raise notice '  active enrolls = %', v_enrollments;
end $$;

-- Final verification (renders as a result row in the SQL Editor).
select
  u.role,
  u.is_admin,
  u.full_name as parent_name,
  s.full_name as student_name,
  s.grade,
  coalesce(
    json_agg(a.name order by a.name) filter (where a.id is not null),
    '[]'::json
  ) as active_activities
from public.users u
left join public.students    s on s.parent_id  = u.id and s.full_name  = 'Ana Mendoza'
left join public.enrollments e on e.student_id = s.id and e.status     = 'active'
left join public.activities  a on a.id         = e.activity_id
where u.email = 'ai@portescosports.com'
group by u.role, u.is_admin, u.full_name, s.full_name, s.grade;
