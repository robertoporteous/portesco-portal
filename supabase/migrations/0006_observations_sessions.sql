-- 0006_observations_sessions.sql
-- PORTESCO Portal — Sprint 2 Bloque 1, step 2
--
-- Purpose:
--   The operational core of Coordinator Pad + Voice Capture. Adds the
--   tables Kassandra and Alexander touch every day: class_sessions,
--   class_attendance, class_eventualities, class_observations (voice/text
--   input from the professor), mention_assignments (one group voice note
--   → N individual mentions), and internal_alerts (attendance auto-alerts
--   + future flags).
--
-- Also:
--   - 8 new enums.
--   - 5 SECURITY DEFINER helpers (NOT 2 as architecture §3.1 suggested).
--     Per AGENTS.md §9 "recurring error" rule (post-0004), EVERY cross-table
--     reference in a USING / WITH CHECK clause MUST go through a helper.
--     Sub-SELECTs against other tables — even when no cycle exists today —
--     are banned because adding a new table later can create one. The three
--     extra helpers (coordinator/professor/author_observation_ids) keep
--     mention_assignments and class_observations policies sub-SELECT free.
--   - 1 trigger: consecutive_absence → INSERT internal_alerts when a student
--     has 3 consecutive absent/not_marked sessions in the same activity.
--     Idempotent via partial unique index on internal_alerts.
--   - ALTER TABLE audit_logs ADD CONSTRAINT closing the FK
--     related_observation_id → class_observations(id) deferred from 0005.
--
-- Ordering note (v1 of this file failed here — fixed in v2):
--   LANGUAGE sql functions resolve identifiers at CREATE time, NOT lazily
--   like LANGUAGE plpgsql. So we MUST create the tables before any helper
--   that references them. Order in this file:
--     enums → tables (+indexes +updated_at triggers +RLS enable, no policies)
--     → helpers → ALL policies → trigger function + trigger → FK alter
--     → verification.
--
-- Idempotent everywhere: enums wrapped in DO blocks, CREATE TABLE IF NOT
-- EXISTS, DROP POLICY IF EXISTS before recreate, CREATE INDEX IF NOT EXISTS.

begin;

-- ============================================================
-- 1. Enums (8 new)
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type attendance_status as enum ('present', 'absent', 'justified', 'late', 'not_marked');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'eventuality_type') then
    create type eventuality_type as enum (
      'lesion', 'retiro_temprano', 'conflicto', 'comportamiento',
      'tarde', 'tarea_pendiente', 'otro'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'eventuality_severity') then
    create type eventuality_severity as enum ('info', 'attention', 'urgent');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'observation_kind') then
    create type observation_kind as enum (
      'voice_group', 'voice_individual', 'text_group', 'text_individual'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'extraction_status') then
    create type extraction_status as enum (
      'pending_transcription',
      'pending_extraction',
      'pending_confirmation',
      'confirmed',
      'transcription_failed',
      'extraction_failed'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ai_confidence') then
    create type ai_confidence as enum ('high', 'medium', 'low');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'mention_sentiment') then
    create type mention_sentiment as enum ('positive', 'neutral', 'concern', 'negative');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'alert_type') then
    create type alert_type as enum (
      'consecutive_absence', 'no_input_3_classes', 'observation_low_confidence', 'other'
    );
  end if;
end $$;

-- ============================================================
-- 2. Tables (create + indexes + updated_at triggers + RLS enable)
--    Policies come later, after helpers exist.
-- ============================================================

-- ---------- class_sessions ----------

create table if not exists class_sessions (
  id                  uuid primary key default gen_random_uuid(),
  activity_id         uuid not null references activities(id) on delete cascade,
  scheduled_start_at  timestamptz not null,
  scheduled_end_at    timestamptz not null,
  actual_start_at     timestamptz,
  actual_end_at       timestamptz,
  closed_at           timestamptz,
  closed_by           uuid references users(id),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists class_sessions_set_updated_at on class_sessions;
create trigger class_sessions_set_updated_at
  before update on class_sessions
  for each row execute function set_updated_at();

create index if not exists class_sessions_activity_start_idx
  on class_sessions (activity_id, scheduled_start_at);
create index if not exists class_sessions_open_idx
  on class_sessions (activity_id) where closed_at is null;

alter table class_sessions enable row level security;

-- ---------- class_attendance ----------

create table if not exists class_attendance (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references class_sessions(id) on delete cascade,
  student_id          uuid not null references students(id) on delete cascade,
  status              attendance_status not null default 'not_marked',
  marked_at           timestamptz,
  marked_by           uuid references users(id),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (session_id, student_id)
);

drop trigger if exists class_attendance_set_updated_at on class_attendance;
create trigger class_attendance_set_updated_at
  before update on class_attendance
  for each row execute function set_updated_at();

create index if not exists class_attendance_session_idx
  on class_attendance (session_id);
create index if not exists class_attendance_student_idx
  on class_attendance (student_id, marked_at desc);

alter table class_attendance enable row level security;

-- ---------- class_eventualities ----------

create table if not exists class_eventualities (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references class_sessions(id) on delete cascade,
  student_id      uuid references students(id) on delete cascade,
  type            eventuality_type not null,
  severity        eventuality_severity not null default 'info',
  notes           text,
  created_by      uuid not null references users(id),
  created_at      timestamptz not null default now()
);

create index if not exists class_eventualities_session_idx
  on class_eventualities (session_id);
create index if not exists class_eventualities_student_idx
  on class_eventualities (student_id, created_at desc);

alter table class_eventualities enable row level security;

-- ---------- class_observations ----------

create table if not exists class_observations (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references class_sessions(id) on delete cascade,
  author_id                uuid not null references users(id),
  kind                     observation_kind not null,
  audio_storage_path       text,
  audio_duration_seconds   int,
  transcript_raw           text,
  transcript_pii_redacted  text,
  extraction_json          jsonb,
  extraction_status        extraction_status not null default 'pending_transcription',
  confirmation_ts          timestamptz,
  text_content             text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists class_observations_set_updated_at on class_observations;
create trigger class_observations_set_updated_at
  before update on class_observations
  for each row execute function set_updated_at();

create index if not exists class_observations_session_idx
  on class_observations (session_id);
create index if not exists class_observations_author_created_idx
  on class_observations (author_id, created_at desc);
create index if not exists class_observations_pending_idx
  on class_observations (extraction_status) where extraction_status <> 'confirmed';

alter table class_observations enable row level security;

-- ---------- mention_assignments ----------

create table if not exists mention_assignments (
  id                  uuid primary key default gen_random_uuid(),
  observation_id      uuid not null references class_observations(id) on delete cascade,
  student_id          uuid not null references students(id) on delete cascade,
  content_snippet     text not null,
  sentiment           mention_sentiment not null,
  ai_confidence       ai_confidence not null,
  professor_corrected boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists mention_assignments_student_idx
  on mention_assignments (student_id, created_at desc);
create index if not exists mention_assignments_observation_idx
  on mention_assignments (observation_id);

alter table mention_assignments enable row level security;

-- ---------- internal_alerts ----------

create table if not exists internal_alerts (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  student_id      uuid references students(id) on delete cascade,
  activity_id     uuid references activities(id) on delete cascade,
  type            alert_type not null,
  severity        eventuality_severity not null default 'attention',
  payload         jsonb,
  triggered_at    timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references users(id)
);

create index if not exists internal_alerts_school_unack_idx
  on internal_alerts (school_id, triggered_at desc)
  where acknowledged_at is null;

-- Idempotency for consecutive_absence trigger: at most one open alert per
-- (student, activity, type=consecutive_absence). Once acknowledged, a new
-- one can be raised on the next streak.
create unique index if not exists internal_alerts_unique_active_consec_absence
  on internal_alerts (student_id, activity_id)
  where acknowledged_at is null and type = 'consecutive_absence';

alter table internal_alerts enable row level security;

-- ============================================================
-- 3. Helper functions (5 new) — created AFTER tables exist.
-- ============================================================

create or replace function public.coordinator_session_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select cs.id
  from public.class_sessions cs
  join public.activities a on a.id = cs.activity_id
  where a.school_id in (
    select school_id from public.staff_schools
    where user_id = auth.uid() and role = 'coordinator'
  );
$$;

create or replace function public.professor_session_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select cs.id
  from public.class_sessions cs
  where cs.activity_id in (
    select activity_id from public.staff_activities
    where user_id = auth.uid()
  );
$$;

create or replace function public.coordinator_observation_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select co.id
  from public.class_observations co
  join public.class_sessions cs on cs.id = co.session_id
  join public.activities a on a.id = cs.activity_id
  where a.school_id in (
    select school_id from public.staff_schools
    where user_id = auth.uid() and role = 'coordinator'
  );
$$;

create or replace function public.professor_observation_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select co.id
  from public.class_observations co
  join public.class_sessions cs on cs.id = co.session_id
  where cs.activity_id in (
    select activity_id from public.staff_activities
    where user_id = auth.uid()
  );
$$;

create or replace function public.author_observation_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select id from public.class_observations where author_id = auth.uid();
$$;

revoke execute on function public.coordinator_session_ids()      from public;
revoke execute on function public.professor_session_ids()        from public;
revoke execute on function public.coordinator_observation_ids()  from public;
revoke execute on function public.professor_observation_ids()    from public;
revoke execute on function public.author_observation_ids()       from public;

grant  execute on function public.coordinator_session_ids()      to authenticated;
grant  execute on function public.professor_session_ids()        to authenticated;
grant  execute on function public.coordinator_observation_ids()  to authenticated;
grant  execute on function public.professor_observation_ids()    to authenticated;
grant  execute on function public.author_observation_ids()       to authenticated;

-- ============================================================
-- 4. Policies (all 6 tables, now that helpers exist)
-- ============================================================

-- ---------- class_sessions ----------

drop policy if exists "class_sessions: admin" on class_sessions;
create policy "class_sessions: admin"
  on class_sessions for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "class_sessions: coordinator school" on class_sessions;
create policy "class_sessions: coordinator school"
  on class_sessions for all to authenticated
  using (activity_id in (select coordinator_school_activity_ids()))
  with check (activity_id in (select coordinator_school_activity_ids()));

drop policy if exists "class_sessions: professor select own" on class_sessions;
create policy "class_sessions: professor select own"
  on class_sessions for select to authenticated
  using (activity_id in (select user_activity_ids_as_professor()));

-- ---------- class_attendance ----------

drop policy if exists "class_attendance: admin" on class_attendance;
create policy "class_attendance: admin"
  on class_attendance for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "class_attendance: coordinator session" on class_attendance;
create policy "class_attendance: coordinator session"
  on class_attendance for all to authenticated
  using (session_id in (select coordinator_session_ids()))
  with check (session_id in (select coordinator_session_ids()));

drop policy if exists "class_attendance: professor select own" on class_attendance;
create policy "class_attendance: professor select own"
  on class_attendance for select to authenticated
  using (session_id in (select professor_session_ids()));

-- ---------- class_eventualities ----------

drop policy if exists "class_eventualities: admin" on class_eventualities;
create policy "class_eventualities: admin"
  on class_eventualities for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "class_eventualities: coordinator session" on class_eventualities;
create policy "class_eventualities: coordinator session"
  on class_eventualities for all to authenticated
  using (session_id in (select coordinator_session_ids()))
  with check (session_id in (select coordinator_session_ids()));

drop policy if exists "class_eventualities: professor select own" on class_eventualities;
create policy "class_eventualities: professor select own"
  on class_eventualities for select to authenticated
  using (session_id in (select professor_session_ids()));

-- ---------- class_observations ----------

drop policy if exists "class_observations: admin" on class_observations;
create policy "class_observations: admin"
  on class_observations for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "class_observations: author insert own" on class_observations;
create policy "class_observations: author insert own"
  on class_observations for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "class_observations: author select own" on class_observations;
create policy "class_observations: author select own"
  on class_observations for select to authenticated
  using (author_id = auth.uid());

drop policy if exists "class_observations: author update own" on class_observations;
create policy "class_observations: author update own"
  on class_observations for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "class_observations: coordinator select school" on class_observations;
create policy "class_observations: coordinator select school"
  on class_observations for select to authenticated
  using (session_id in (select coordinator_session_ids()));

-- ---------- mention_assignments ----------

drop policy if exists "mention_assignments: admin" on mention_assignments;
create policy "mention_assignments: admin"
  on mention_assignments for all to authenticated
  using (is_admin()) with check (is_admin());

-- Author of the parent observation can insert/update/delete mentions
-- (confirmation flow: PATCH /api/observations/{id}/confirm).
drop policy if exists "mention_assignments: author insert" on mention_assignments;
create policy "mention_assignments: author insert"
  on mention_assignments for insert to authenticated
  with check (observation_id in (select author_observation_ids()));

drop policy if exists "mention_assignments: author update" on mention_assignments;
create policy "mention_assignments: author update"
  on mention_assignments for update to authenticated
  using (observation_id in (select author_observation_ids()))
  with check (observation_id in (select author_observation_ids()));

drop policy if exists "mention_assignments: author delete" on mention_assignments;
create policy "mention_assignments: author delete"
  on mention_assignments for delete to authenticated
  using (observation_id in (select author_observation_ids()));

drop policy if exists "mention_assignments: author select" on mention_assignments;
create policy "mention_assignments: author select"
  on mention_assignments for select to authenticated
  using (observation_id in (select author_observation_ids()));

drop policy if exists "mention_assignments: coordinator select" on mention_assignments;
create policy "mention_assignments: coordinator select"
  on mention_assignments for select to authenticated
  using (observation_id in (select coordinator_observation_ids()));

drop policy if exists "mention_assignments: professor select activity" on mention_assignments;
create policy "mention_assignments: professor select activity"
  on mention_assignments for select to authenticated
  using (observation_id in (select professor_observation_ids()));

-- ---------- internal_alerts ----------

drop policy if exists "internal_alerts: admin" on internal_alerts;
create policy "internal_alerts: admin"
  on internal_alerts for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "internal_alerts: coordinator school" on internal_alerts;
create policy "internal_alerts: coordinator school"
  on internal_alerts for all to authenticated
  using (school_id in (select user_school_ids_as_coordinator()))
  with check (school_id in (select user_school_ids_as_coordinator()));

-- ============================================================
-- 5. Trigger: consecutive_absence on class_attendance
-- ============================================================

create or replace function trigger_consecutive_absence_alert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_activity_id  uuid;
  v_school_id    uuid;
  v_absent_count int;
begin
  -- Only act on absences (and not_marked, which is treated as absent for streaks).
  if new.status not in ('absent', 'not_marked') then
    return new;
  end if;

  -- Resolve activity_id / school_id for the session being marked.
  select cs.activity_id, a.school_id
    into v_activity_id, v_school_id
  from class_sessions cs
  join activities a on a.id = cs.activity_id
  where cs.id = new.session_id;

  -- Count how many of this student's 3 most recent sessions in this activity
  -- (including the row just inserted/updated) are absent/not_marked.
  select count(*)
    into v_absent_count
  from (
    select ca.status
    from class_attendance ca
    join class_sessions cs on cs.id = ca.session_id
    where ca.student_id = new.student_id
      and cs.activity_id = v_activity_id
    order by cs.scheduled_start_at desc
    limit 3
  ) recent
  where status in ('absent', 'not_marked');

  -- Three in a row → raise the alert. Partial unique index keeps it idempotent.
  if v_absent_count = 3 then
    insert into internal_alerts (school_id, student_id, activity_id, type, severity, payload)
    values (
      v_school_id, new.student_id, v_activity_id, 'consecutive_absence', 'attention',
      jsonb_build_object(
        'triggering_session_id', new.session_id,
        'consecutive_count', v_absent_count
      )
    )
    on conflict do nothing;
  end if;

  return new;
end $$;

drop trigger if exists class_attendance_consecutive_absence on class_attendance;
create trigger class_attendance_consecutive_absence
  after insert or update on class_attendance
  for each row execute function trigger_consecutive_absence_alert();

-- ============================================================
-- 6. Close audit_logs FK deferred from 0005
-- ============================================================

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_related_observation_id_fkey'
  ) then
    alter table audit_logs
      add constraint audit_logs_related_observation_id_fkey
      foreign key (related_observation_id)
      references class_observations(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- Verification
-- ============================================================

do $$
declare
  v_enums_new          int;
  v_helpers_new        int;
  v_class_sessions     int;
  v_class_attendance   int;
  v_class_eventual     int;
  v_class_observations int;
  v_mention_assign     int;
  v_internal_alerts    int;
  v_trigger_exists     boolean;
  v_audit_fk_exists    boolean;
begin
  select count(*) into v_enums_new
    from pg_type
    where typname in (
      'attendance_status','eventuality_type','eventuality_severity',
      'observation_kind','extraction_status','ai_confidence',
      'mention_sentiment','alert_type'
    );

  select count(*) into v_helpers_new
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'coordinator_session_ids','professor_session_ids',
        'coordinator_observation_ids','professor_observation_ids',
        'author_observation_ids'
      );

  select count(*) into v_class_sessions     from class_sessions;
  select count(*) into v_class_attendance   from class_attendance;
  select count(*) into v_class_eventual     from class_eventualities;
  select count(*) into v_class_observations from class_observations;
  select count(*) into v_mention_assign     from mention_assignments;
  select count(*) into v_internal_alerts    from internal_alerts;

  select exists (
    select 1 from pg_trigger
    where tgname = 'class_attendance_consecutive_absence'
  ) into v_trigger_exists;

  select exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_related_observation_id_fkey'
  ) into v_audit_fk_exists;

  raise notice '0006 observations_sessions: enums_new=% helpers_new=% class_sessions=% class_attendance=% class_eventualities=% class_observations=% mention_assignments=% internal_alerts=% consecutive_absence_trigger=% audit_fk_added=%',
    v_enums_new, v_helpers_new,
    v_class_sessions, v_class_attendance, v_class_eventual,
    v_class_observations, v_mention_assign, v_internal_alerts,
    v_trigger_exists, v_audit_fk_exists;
end $$;

commit;

-- End of 0006_observations_sessions.sql
