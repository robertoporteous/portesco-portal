-- 0002_rls.sql
-- PORTESCO Portal — Row Level Security policies (Sprint 1)
--
-- Scope: SELECT only. INSERT / UPDATE / DELETE policies land in Sprint 2,
-- when the staff app (Attendo) and admin CRUD start writing to the DB.
-- Until then, all writes happen through the seed (service_role bypasses RLS)
-- or through future server actions that explicitly run as service_role.
--
-- Roles:
--   parent       — public.users.role = 'parent'
--   coordinator  — public.users.role = 'coordinator', staff_schools row(s)
--   professor    — public.users.role = 'professor', staff_activities row(s)
--   admin        — public.users.is_admin = true (override on top of any role)
--
-- Postgres RLS rule: when multiple policies exist on the same table for the
-- same operation, a row is visible if ANY policy's USING clause returns true.
-- That is why each table below has multiple small policies instead of one
-- giant OR — easier to read, easier to audit, easier to remove or add.
--
-- All policies target the `authenticated` role. The Supabase service_role
-- bypasses RLS entirely, so seed and admin scripts are unaffected.

-- ============================================================
-- Helper: is_admin()
-- ============================================================
-- SECURITY DEFINER lets this function read public.users without going
-- through the users RLS policies (which would otherwise loop). The fixed
-- search_path prevents search_path injection. STABLE tells the planner
-- the result is consistent within a single statement.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from public.users where id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated;

-- ============================================================
-- schools
-- ============================================================

create policy "schools: admin sees all"
  on schools for select
  to authenticated
  using (is_admin());

create policy "schools: members see schools they belong to"
  on schools for select
  to authenticated
  using (
    id in (select school_id from students      where parent_id = auth.uid())
    or
    id in (select school_id from staff_schools where user_id  = auth.uid())
  );

-- ============================================================
-- users
-- ============================================================
-- A user always sees their own row (needed for the dashboard greeting,
-- profile menu, etc.). Parents additionally see the professors who teach
-- their kids' activities, so the dashboard can render the professor name.

create policy "users: admin sees all"
  on users for select
  to authenticated
  using (is_admin());

create policy "users: self"
  on users for select
  to authenticated
  using (id = auth.uid());

create policy "users: parent sees professors of own kids' activities"
  on users for select
  to authenticated
  using (
    id in (
      select sa.user_id
      from staff_activities sa
      join enrollments e on e.activity_id = sa.activity_id
      join students    s on s.id          = e.student_id
      where s.parent_id = auth.uid()
    )
  );

-- ============================================================
-- students
-- ============================================================

create policy "students: admin sees all"
  on students for select
  to authenticated
  using (is_admin());

create policy "students: parent sees own children"
  on students for select
  to authenticated
  using (parent_id = auth.uid());

create policy "students: coordinator sees students in own schools"
  on students for select
  to authenticated
  using (
    school_id in (
      select school_id
      from staff_schools
      where user_id = auth.uid() and role = 'coordinator'
    )
  );

create policy "students: professor sees students in own activities"
  on students for select
  to authenticated
  using (
    id in (
      select e.student_id
      from enrollments e
      join staff_activities sa on sa.activity_id = e.activity_id
      where sa.user_id = auth.uid()
    )
  );

-- ============================================================
-- activities
-- ============================================================
-- Sprint 1 keeps parent visibility tight: only activities where the
-- parent's child is enrolled. The catalog-browse case (parent considering
-- a new enrollment) is Sprint 2+ and will get its own broader policy.

create policy "activities: admin sees all"
  on activities for select
  to authenticated
  using (is_admin());

create policy "activities: parent sees activities of own kids"
  on activities for select
  to authenticated
  using (
    id in (
      select activity_id
      from enrollments
      where student_id in (
        select id from students where parent_id = auth.uid()
      )
    )
  );

create policy "activities: coordinator sees activities in own schools"
  on activities for select
  to authenticated
  using (
    school_id in (
      select school_id
      from staff_schools
      where user_id = auth.uid() and role = 'coordinator'
    )
  );

create policy "activities: professor sees own activities"
  on activities for select
  to authenticated
  using (
    id in (
      select activity_id from staff_activities where user_id = auth.uid()
    )
  );

-- ============================================================
-- enrollments
-- ============================================================

create policy "enrollments: admin sees all"
  on enrollments for select
  to authenticated
  using (is_admin());

create policy "enrollments: parent sees enrollments of own kids"
  on enrollments for select
  to authenticated
  using (
    student_id in (
      select id from students where parent_id = auth.uid()
    )
  );

create policy "enrollments: coordinator sees enrollments in own schools"
  on enrollments for select
  to authenticated
  using (
    student_id in (
      select id
      from students
      where school_id in (
        select school_id
        from staff_schools
        where user_id = auth.uid() and role = 'coordinator'
      )
    )
  );

create policy "enrollments: professor sees enrollments in own activities"
  on enrollments for select
  to authenticated
  using (
    activity_id in (
      select activity_id from staff_activities where user_id = auth.uid()
    )
  );

-- ============================================================
-- staff_schools
-- ============================================================

create policy "staff_schools: admin sees all"
  on staff_schools for select
  to authenticated
  using (is_admin());

create policy "staff_schools: self"
  on staff_schools for select
  to authenticated
  using (user_id = auth.uid());

create policy "staff_schools: coordinator sees colleagues at own schools"
  on staff_schools for select
  to authenticated
  using (
    school_id in (
      select school_id
      from staff_schools as me
      where me.user_id = auth.uid() and me.role = 'coordinator'
    )
  );

-- ============================================================
-- staff_activities
-- ============================================================

create policy "staff_activities: admin sees all"
  on staff_activities for select
  to authenticated
  using (is_admin());

create policy "staff_activities: self"
  on staff_activities for select
  to authenticated
  using (user_id = auth.uid());

create policy "staff_activities: parent sees assignments for own kids' activities"
  on staff_activities for select
  to authenticated
  using (
    activity_id in (
      select activity_id
      from enrollments
      where student_id in (
        select id from students where parent_id = auth.uid()
      )
    )
  );

create policy "staff_activities: coordinator sees assignments at own schools"
  on staff_activities for select
  to authenticated
  using (
    activity_id in (
      select id
      from activities
      where school_id in (
        select school_id
        from staff_schools
        where user_id = auth.uid() and role = 'coordinator'
      )
    )
  );

-- End of 0002_rls.sql
