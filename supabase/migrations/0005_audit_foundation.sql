-- 0005_audit_foundation.sql
-- PORTESCO Portal — Sprint 2 Bloque 1, step 1
--
-- Purpose:
--   1. Create audit_logs (append-only) per AGENTS.md §3.3.
--      Every Claude / Whisper call writes one row. INSERT/UPDATE/DELETE only
--      via service_role; authenticated users (admins) can SELECT for review.
--   2. Create feedback_events (thumbs up/down) per AGENTS.md §3.6.
--      Zero-friction telemetry near every AI output.
--   3. Close the Sprint 1 write-side RLS gap for the existing tables
--      (students, enrollments, staff_schools, staff_activities). Until now
--      writes worked because the migrations layer ran with service_role,
--      bypassing RLS. Sprint 2 needs server actions to insert/update via
--      the authenticated user (Kassandra creating sessions, coordinator
--      enrolling kids, etc.), so we add narrow INSERT/UPDATE/DELETE policies.
--
-- Forward FK notes (NOT added here, on purpose, to keep this migration
-- self-contained and roll-back-friendly):
--   - audit_logs.related_observation_id (uuid) gets its FK to
--     class_observations(id) added inside migration 0006.
--   - audit_logs.related_report_id (uuid) gets its FK to bi_weekly_reports(id)
--     added inside migration 0007.
--
-- Helpers used (already defined in 0004):
--   is_admin(), user_school_ids_as_coordinator(),
--   coordinator_school_student_ids().
--
-- All blocks are idempotent: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS
-- before CREATE POLICY, CREATE INDEX IF NOT EXISTS.

begin;

-- ============================================================
-- 1. audit_logs
-- ============================================================

create table if not exists audit_logs (
  id                          uuid primary key default gen_random_uuid(),
  ts                          timestamptz not null default now(),
  user_id                     uuid references users(id) on delete set null,
  feature                     text not null,
  input_raw                   text,
  input_redacted              text,
  ai_output                   text,
  human_edit                  text,
  human_decision              text,
  data_classification         text not null,
  model_name                  text,
  model_version               text,
  input_tokens                int,
  output_tokens               int,
  latency_ms                  int,
  ai_confidence               text,
  edit_distance               int,
  time_to_approve_seconds     int,
  related_observation_id      uuid,  -- FK added in 0006
  related_report_id           uuid,  -- FK added in 0007
  metadata                    jsonb,
  created_at                  timestamptz not null default now()
);

create index if not exists audit_logs_ts_idx
  on audit_logs (ts desc);
create index if not exists audit_logs_feature_ts_idx
  on audit_logs (feature, ts desc);
create index if not exists audit_logs_user_ts_idx
  on audit_logs (user_id, ts desc);

alter table audit_logs enable row level security;

-- Admin reads. No INSERT/UPDATE/DELETE policies → only service_role writes.
-- Append-only: no DELETE policy at all, ever.
drop policy if exists "audit_logs: admin reads" on audit_logs;
create policy "audit_logs: admin reads"
  on audit_logs for select
  to authenticated
  using (is_admin());

-- ============================================================
-- 2. feedback_events
-- ============================================================

create table if not exists feedback_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  feature       text not null,
  target_id     uuid not null,
  rating        text not null check (rating in ('up','down')),
  ts            timestamptz not null default now()
);

create index if not exists feedback_events_target_idx
  on feedback_events (feature, target_id);

alter table feedback_events enable row level security;

drop policy if exists "feedback_events: insert own" on feedback_events;
create policy "feedback_events: insert own"
  on feedback_events for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "feedback_events: select own + admin" on feedback_events;
create policy "feedback_events: select own + admin"
  on feedback_events for select
  to authenticated
  using (user_id = auth.uid() or is_admin());

-- No UPDATE policy (thumbs are immutable — to change, INSERT a new row).
-- No DELETE policy (append-only telemetry).

-- ============================================================
-- 3. Write-side RLS on existing tables (Sprint 1 debt closed)
-- ============================================================
--
-- Pattern: admin can always write; coordinator can write within own schools;
-- professor cannot write to these tables in Sprint 2 (writes happen in
-- class_observations etc., added in 0006); parent never writes.

-- ---------- students ----------

drop policy if exists "students: insert by admin or school coordinator" on students;
create policy "students: insert by admin or school coordinator"
  on students for insert
  to authenticated
  with check (
    is_admin()
    or school_id in (select user_school_ids_as_coordinator())
  );

drop policy if exists "students: update by admin or school coordinator" on students;
create policy "students: update by admin or school coordinator"
  on students for update
  to authenticated
  using (
    is_admin()
    or school_id in (select user_school_ids_as_coordinator())
  )
  with check (
    is_admin()
    or school_id in (select user_school_ids_as_coordinator())
  );

drop policy if exists "students: delete by admin" on students;
create policy "students: delete by admin"
  on students for delete
  to authenticated
  using (is_admin());

-- ---------- enrollments ----------
--
-- Coordinator can enroll/unenroll any student that belongs to one of their
-- schools. Uses helper coordinator_school_student_ids() (defined in 0004).

drop policy if exists "enrollments: insert by admin or school coordinator" on enrollments;
create policy "enrollments: insert by admin or school coordinator"
  on enrollments for insert
  to authenticated
  with check (
    is_admin()
    or student_id in (select coordinator_school_student_ids())
  );

drop policy if exists "enrollments: update by admin or school coordinator" on enrollments;
create policy "enrollments: update by admin or school coordinator"
  on enrollments for update
  to authenticated
  using (
    is_admin()
    or student_id in (select coordinator_school_student_ids())
  )
  with check (
    is_admin()
    or student_id in (select coordinator_school_student_ids())
  );

drop policy if exists "enrollments: delete by admin" on enrollments;
create policy "enrollments: delete by admin"
  on enrollments for delete
  to authenticated
  using (is_admin());

-- ---------- staff_schools ----------
--
-- Sprint 2: assignments are managed by admin only (no UI yet for coordinator
-- self-promotion or peer invites). Tightened to admin-only DML.

drop policy if exists "staff_schools: admin writes" on staff_schools;
create policy "staff_schools: admin writes"
  on staff_schools for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------- staff_activities ----------
--
-- Same rationale as staff_schools: admin-only assignments in Sprint 2.

drop policy if exists "staff_activities: admin writes" on staff_activities;
create policy "staff_activities: admin writes"
  on staff_activities for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================
-- Verification
-- ============================================================

do $$
declare
  v_audit_count            int;
  v_feedback_count         int;
  v_audit_policies         int;
  v_feedback_policies      int;
  v_students_write_pols    int;
  v_enrollments_write_pols int;
  v_staff_schools_pols     int;
  v_staff_activities_pols  int;
begin
  select count(*) into v_audit_count    from audit_logs;
  select count(*) into v_feedback_count from feedback_events;

  select count(*) into v_audit_policies
    from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs';

  select count(*) into v_feedback_policies
    from pg_policies
    where schemaname = 'public' and tablename = 'feedback_events';

  select count(*) into v_students_write_pols
    from pg_policies
    where schemaname = 'public' and tablename = 'students'
      and cmd in ('INSERT','UPDATE','DELETE');

  select count(*) into v_enrollments_write_pols
    from pg_policies
    where schemaname = 'public' and tablename = 'enrollments'
      and cmd in ('INSERT','UPDATE','DELETE');

  select count(*) into v_staff_schools_pols
    from pg_policies
    where schemaname = 'public' and tablename = 'staff_schools'
      and cmd = 'ALL';

  select count(*) into v_staff_activities_pols
    from pg_policies
    where schemaname = 'public' and tablename = 'staff_activities'
      and cmd = 'ALL';

  raise notice '0005 audit_foundation: audit_logs=% feedback_events=% audit_policies=% feedback_policies=% students_write=% enrollments_write=% staff_schools_all=% staff_activities_all=%',
    v_audit_count,
    v_feedback_count,
    v_audit_policies,
    v_feedback_policies,
    v_students_write_pols,
    v_enrollments_write_pols,
    v_staff_schools_pols,
    v_staff_activities_pols;
end $$;

commit;

-- End of 0005_audit_foundation.sql
