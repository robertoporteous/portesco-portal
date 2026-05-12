-- 0004_fix_rls_recursion.sql
-- PORTESCO Portal — Fix RLS recursion (Sprint 1 Bloque 2)
--
-- Bug: Postgres detecta "infinite recursion detected in policy for relation
-- 'staff_activities'" cuando un parent autenticado consulta students con un
-- nested select que toca enrollments y activities.
--
-- Causa raíz: el OR de policies SELECT sobre activities y staff_activities
-- (y otras) forma un ciclo:
--   activities.SELECT
--     -> "activities: professor sees own activities"
--          -> SELECT activity_id FROM staff_activities WHERE user_id = auth.uid()
--             -> staff_activities.SELECT
--                  -> "staff_activities: coordinator sees assignments at own schools"
--                       -> SELECT id FROM activities WHERE school_id IN (...)
--                          -> activities.SELECT  ← LOOP
--
-- Loops indirectos similares: students <-> enrollments via prof/coord chains;
-- users <-> staff_activities via parent-sees-professors policy.
--
-- Solución: extraer cada cross-table reference de las USING clauses a una
-- SECURITY DEFINER function. Las functions ejecutan con privilegios del owner
-- y bypassean RLS interno (mismo patrón que public.is_admin() en 0002_rls.sql).
-- Después de esta migration, ninguna USING clause contiene un sub-select directo
-- a otra tabla; todo cross-table reference pasa por una function opaca al
-- analizador de RLS de Postgres.
--
-- Esta migration:
--   1. Crea 9 helper functions.
--   2. Dropea las 13 policies cross-table problemáticas.
--   3. Recrea las 13 policies usando las functions.
--
-- Policies que NO cambian (admin/self/parent-own-children con auth.uid() directo):
--   schools/users/students/activities/enrollments/staff_schools/staff_activities :: admin
--   users :: self
--   students :: parent sees own children
--   staff_schools :: self
--   staff_activities :: self
--
-- Toda function tiene SECURITY DEFINER, search_path fijo, STABLE,
-- execute revoked from public + granted to authenticated. Mismo hardening
-- que la helper is_admin() de 0002_rls.sql.

-- ============================================================
-- Helper functions
-- ============================================================

-- 1. student_ids where parent_id = auth.uid()
--    Used by: enrollments.parent
create or replace function public.parent_child_student_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select id from public.students where parent_id = auth.uid();
$$;

-- 2. activity_ids enrolled by the current parent's children
--    Used by: activities.parent, staff_activities.parent, users.parent (indirect)
create or replace function public.parent_child_activity_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select e.activity_id
  from public.enrollments e
  join public.students s on s.id = e.student_id
  where s.parent_id = auth.uid();
$$;

-- 3. school_ids where the current user is a coordinator
--    Used by: students.coord, activities.coord, staff_schools.coord
create or replace function public.user_school_ids_as_coordinator()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select school_id
  from public.staff_schools
  where user_id = auth.uid() and role = 'coordinator';
$$;

-- 4. activity_ids where the current user is the assigned professor
--    Used by: activities.prof, enrollments.prof
create or replace function public.user_activity_ids_as_professor()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select activity_id
  from public.staff_activities
  where user_id = auth.uid();
$$;

-- 5. school_ids where the current user is a parent of an enrolled student
--    OR a staff member assigned to a school
--    Used by: schools.members
create or replace function public.user_school_ids_as_member()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select school_id from public.students      where parent_id = auth.uid()
  union
  select school_id from public.staff_schools where user_id  = auth.uid();
$$;

-- 6. user_ids of professors teaching this parent's kids' activities
--    Used by: users.parent-sees-professors
create or replace function public.parent_kids_professor_user_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select sa.user_id
  from public.staff_activities sa
  join public.enrollments      e on e.activity_id = sa.activity_id
  join public.students         s on s.id          = e.student_id
  where s.parent_id = auth.uid();
$$;

-- 7. activity_ids in schools where the current user is a coordinator
--    Used by: staff_activities.coord
create or replace function public.coordinator_school_activity_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select id
  from public.activities
  where school_id in (
    select school_id
    from public.staff_schools
    where user_id = auth.uid() and role = 'coordinator'
  );
$$;

-- 8. student_ids in schools where the current user is a coordinator
--    Used by: enrollments.coord
create or replace function public.coordinator_school_student_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select id
  from public.students
  where school_id in (
    select school_id
    from public.staff_schools
    where user_id = auth.uid() and role = 'coordinator'
  );
$$;

-- 9. student_ids enrolled in activities the current user teaches as professor
--    Used by: students.prof
create or replace function public.professor_taught_student_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select e.student_id
  from public.enrollments e
  where e.activity_id in (
    select activity_id
    from public.staff_activities
    where user_id = auth.uid()
  );
$$;

-- ============================================================
-- Lock down execute privileges (mirror of is_admin() in 0002).
-- ============================================================

revoke execute on function public.parent_child_student_ids()           from public;
revoke execute on function public.parent_child_activity_ids()          from public;
revoke execute on function public.user_school_ids_as_coordinator()     from public;
revoke execute on function public.user_activity_ids_as_professor()     from public;
revoke execute on function public.user_school_ids_as_member()          from public;
revoke execute on function public.parent_kids_professor_user_ids()     from public;
revoke execute on function public.coordinator_school_activity_ids()    from public;
revoke execute on function public.coordinator_school_student_ids()     from public;
revoke execute on function public.professor_taught_student_ids()       from public;

grant execute on function public.parent_child_student_ids()            to authenticated;
grant execute on function public.parent_child_activity_ids()           to authenticated;
grant execute on function public.user_school_ids_as_coordinator()      to authenticated;
grant execute on function public.user_activity_ids_as_professor()      to authenticated;
grant execute on function public.user_school_ids_as_member()           to authenticated;
grant execute on function public.parent_kids_professor_user_ids()      to authenticated;
grant execute on function public.coordinator_school_activity_ids()     to authenticated;
grant execute on function public.coordinator_school_student_ids()      to authenticated;
grant execute on function public.professor_taught_student_ids()        to authenticated;

-- ============================================================
-- schools — 1 policy rewritten
-- ============================================================

drop policy if exists "schools: members see schools they belong to" on schools;
create policy "schools: members see schools they belong to"
  on schools for select
  to authenticated
  using (id in (select user_school_ids_as_member()));

-- ============================================================
-- users — 1 policy rewritten (admin + self stay unchanged)
-- ============================================================

drop policy if exists "users: parent sees professors of own kids' activities" on users;
create policy "users: parent sees professors of own kids' activities"
  on users for select
  to authenticated
  using (id in (select parent_kids_professor_user_ids()));

-- ============================================================
-- students — 2 policies rewritten (admin + parent-own-children stay)
-- ============================================================

drop policy if exists "students: coordinator sees students in own schools" on students;
create policy "students: coordinator sees students in own schools"
  on students for select
  to authenticated
  using (school_id in (select user_school_ids_as_coordinator()));

drop policy if exists "students: professor sees students in own activities" on students;
create policy "students: professor sees students in own activities"
  on students for select
  to authenticated
  using (id in (select professor_taught_student_ids()));

-- ============================================================
-- activities — 3 policies rewritten (admin stays)
-- ============================================================

drop policy if exists "activities: parent sees activities of own kids" on activities;
create policy "activities: parent sees activities of own kids"
  on activities for select
  to authenticated
  using (id in (select parent_child_activity_ids()));

drop policy if exists "activities: coordinator sees activities in own schools" on activities;
create policy "activities: coordinator sees activities in own schools"
  on activities for select
  to authenticated
  using (school_id in (select user_school_ids_as_coordinator()));

drop policy if exists "activities: professor sees own activities" on activities;
create policy "activities: professor sees own activities"
  on activities for select
  to authenticated
  using (id in (select user_activity_ids_as_professor()));

-- ============================================================
-- enrollments — 3 policies rewritten (admin stays)
-- ============================================================

drop policy if exists "enrollments: parent sees enrollments of own kids" on enrollments;
create policy "enrollments: parent sees enrollments of own kids"
  on enrollments for select
  to authenticated
  using (student_id in (select parent_child_student_ids()));

drop policy if exists "enrollments: coordinator sees enrollments in own schools" on enrollments;
create policy "enrollments: coordinator sees enrollments in own schools"
  on enrollments for select
  to authenticated
  using (student_id in (select coordinator_school_student_ids()));

drop policy if exists "enrollments: professor sees enrollments in own activities" on enrollments;
create policy "enrollments: professor sees enrollments in own activities"
  on enrollments for select
  to authenticated
  using (activity_id in (select user_activity_ids_as_professor()));

-- ============================================================
-- staff_schools — 1 policy rewritten (admin + self stay)
-- ============================================================

drop policy if exists "staff_schools: coordinator sees colleagues at own schools" on staff_schools;
create policy "staff_schools: coordinator sees colleagues at own schools"
  on staff_schools for select
  to authenticated
  using (school_id in (select user_school_ids_as_coordinator()));

-- ============================================================
-- staff_activities — 2 policies rewritten (admin + self stay)
-- ============================================================

drop policy if exists "staff_activities: parent sees assignments for own kids' activities" on staff_activities;
create policy "staff_activities: parent sees assignments for own kids' activities"
  on staff_activities for select
  to authenticated
  using (activity_id in (select parent_child_activity_ids()));

drop policy if exists "staff_activities: coordinator sees assignments at own schools" on staff_activities;
create policy "staff_activities: coordinator sees assignments at own schools"
  on staff_activities for select
  to authenticated
  using (activity_id in (select coordinator_school_activity_ids()));

-- End of 0004_fix_rls_recursion.sql
