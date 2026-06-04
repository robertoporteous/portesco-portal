-- 0007_profile_observations_reports.sql
-- PORTESCO Portal — Sprint 2 Bloque 1, step 3
--
-- Purpose:
--   The AI-native data layer of Sprint 2:
--   - student_profiles: aggregated snapshot per kid (checklist scores +
--     observations_count). NOT the source of truth. NO observations_log JSONB
--     column (removed per Triple Check 25 mayo 2026 — see architecture v2 §2.4).
--   - profile_observations: NORMALIZED source of truth for every kid mention.
--     5 composite indexes cover the 5 queries we actually run (latest N by
--     date, filter by sentiment, filter by confidence, count per professor,
--     count per month). Migrating later at 50–150M rows = expensive vs
--     getting it right on day one.
--   - bi_weekly_reports: consolidated report per kid per cycle, with the
--     Kassandra-facing review queue and AI telemetry columns.
--   - wa_inbox: raw WhatsApp ingest receiver (Sprint 2 stores only, no parse).
--
-- RLS v2 (post-Triple Check fix):
--   student_profiles, profile_observations, wa_inbox have SELECT-only RLS
--   policies + an explicit REVOKE INSERT, UPDATE, DELETE FROM authenticated,
--   anon. This is the fix for the bug where "FOR ALL ... USING (is_admin())"
--   was accidentally granting DML to any authenticated admin via the policy
--   path, contradicting "writes only via service_role".
--
--   bi_weekly_reports is the one exception: coordinators legitimately UPDATE
--   reports (the "Edit and Approve" action), so it keeps a coordinator UPDATE
--   policy. DELETE is still revoked from authenticated/anon (append-only).
--
-- Enum decision — Opción B (YAGNI):
--   Architecture §2.4 originally specified a new enum `observation_sentiment`
--   for profile_observations.sentiment. Its 4 values are identical to
--   `mention_sentiment` (created in 0006: positive | neutral | concern |
--   negative). We REUSE mention_sentiment to avoid a redundant enum + an
--   inter-enum cast in the trigger. Trade-off documented as implicit debt:
--   DROP TYPE mention_sentiment is no longer possible without affecting
--   profile_observations. If the two ever need to diverge, do it then with
--   a fresh CREATE TYPE + ALTER COLUMN. See COMMENT ON COLUMN below.
--
-- Helpers used: only the ones already defined in 0004 (is_admin,
-- user_school_ids_as_coordinator, coordinator_school_student_ids,
-- coordinator_school_activity_ids, professor_taught_student_ids,
-- user_activity_ids_as_professor). school_id is denormalized in
-- profile_observations so its coordinator policy is one IN-of-helper away.
--
-- Order: enums → tables (+indexes +updated_at triggers +RLS enable, no
-- policies) → COMMENT ON COLUMN → policies → trigger function + trigger
-- → FK alter → verification. Same lesson learned in 0006 v2.

begin;

-- ============================================================
-- 1. Enums (1 new: report_status)
--    observation_sentiment NOT created — we reuse mention_sentiment from 0006.
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type report_status as enum (
      'draft_pending_review', 'approved', 'regenerating', 'skipped', 'failed'
    );
  end if;
end $$;

-- ============================================================
-- 2. Tables (create + indexes + updated_at triggers + RLS enable)
-- ============================================================

-- ---------- student_profiles ----------
-- Aggregated snapshot per kid. NO observations_log JSONB (removed v2).
-- student_id is UNIQUE → btree index automatic; do NOT add a redundant
-- student_profiles_student_idx (Triple Check lesson).

create table if not exists student_profiles (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null unique references students(id) on delete cascade,
  checklist_scores     jsonb not null default '{}'::jsonb,
  observations_count   int not null default 0,
  last_consolidated_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists student_profiles_set_updated_at on student_profiles;
create trigger student_profiles_set_updated_at
  before update on student_profiles
  for each row execute function set_updated_at();

alter table student_profiles enable row level security;

-- ---------- profile_observations ----------
-- NORMALIZED source of truth.
-- sentiment is mention_sentiment (see header decision).

create table if not exists profile_observations (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references students(id) on delete cascade,
  school_id       uuid not null references schools(id),  -- denormalized for RLS
  mention_id      uuid not null unique references mention_assignments(id) on delete cascade,
  session_id      uuid not null references class_sessions(id) on delete cascade,
  observed_on     date not null,
  sentiment       mention_sentiment not null,
  confidence      ai_confidence not null,
  content         text not null,
  professor_id    uuid not null references users(id),
  created_at      timestamptz not null default now()
);

-- (a) Last N entries for the kid (bi-weekly consolidator).
create index if not exists profile_obs_student_date_idx
  on profile_observations (student_id, observed_on desc, created_at desc);

-- (b) Filter by sentiment for a kid.
create index if not exists profile_obs_student_sentiment_idx
  on profile_observations (student_id, sentiment, observed_on desc);

-- (c) Filter by confidence for a kid.
create index if not exists profile_obs_student_confidence_idx
  on profile_observations (student_id, confidence, observed_on desc);

-- (d) Count per professor per school (analytics).
create index if not exists profile_obs_school_professor_idx
  on profile_observations (school_id, professor_id);

-- (e) Count per month per school (analytics Sprint 3+).
create index if not exists profile_obs_school_date_idx
  on profile_observations (school_id, observed_on);

alter table profile_observations enable row level security;

-- ---------- bi_weekly_reports ----------

create table if not exists bi_weekly_reports (
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid not null references students(id) on delete cascade,
  activity_id             uuid not null references activities(id) on delete cascade,
  cycle_number            int not null,
  period_start            date not null,
  period_end              date not null,
  sessions_count          int not null default 0,
  mentions_count          int not null default 0,
  ai_draft                text,
  final_text              text,
  confidence_scores       jsonb not null default '{}'::jsonb,
  status                  report_status not null default 'draft_pending_review',
  reviewed_by             uuid references users(id),
  reviewed_at             timestamptz,
  regenerate_reason       text,
  skip_reason             text,
  parent_visible          boolean not null default false,
  model_name              text,
  model_version           text,
  input_tokens            int,
  output_tokens           int,
  latency_ms              int,
  edit_distance           int,
  time_to_approve_seconds int,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (student_id, activity_id, cycle_number)
);

drop trigger if exists bi_weekly_reports_set_updated_at on bi_weekly_reports;
create trigger bi_weekly_reports_set_updated_at
  before update on bi_weekly_reports
  for each row execute function set_updated_at();

create index if not exists bi_weekly_reports_student_cycle_idx
  on bi_weekly_reports (student_id, cycle_number desc);
create index if not exists bi_weekly_reports_pending_idx
  on bi_weekly_reports (activity_id, cycle_number, status)
  where status = 'draft_pending_review';

alter table bi_weekly_reports enable row level security;

-- ---------- wa_inbox ----------

create table if not exists wa_inbox (
  id                 uuid primary key default gen_random_uuid(),
  from_phone         text not null,
  message_text       text,
  attached_image_url text,
  received_at        timestamptz not null,
  raw_payload        jsonb,
  processed          boolean not null default false,
  matched_user_id    uuid references users(id),
  created_at         timestamptz not null default now()
);

create index if not exists wa_inbox_phone_idx
  on wa_inbox (from_phone, received_at desc);
create index if not exists wa_inbox_unprocessed_idx
  on wa_inbox (received_at desc) where processed = false;

alter table wa_inbox enable row level security;

-- ============================================================
-- 3. Semantic column comments
--    Documents the YAGNI decision so the next dev doesn't read
--    `sentiment mention_sentiment` and assume it's a bug.
-- ============================================================

comment on column profile_observations.sentiment is
  'enum mention_sentiment reused from migration 0006 — same 4 values (positive|neutral|concern|negative). See 0007 header. Implicit debt: DROP TYPE mention_sentiment is no longer possible without affecting this column.';

-- ============================================================
-- 4. RLS policies
-- ============================================================

-- ---------- student_profiles (SELECT only + REVOKE DML — Triple Check fix) ----------

revoke insert, update, delete on student_profiles from authenticated;
revoke insert, update, delete on student_profiles from anon;

drop policy if exists "student_profiles: admin reads" on student_profiles;
create policy "student_profiles: admin reads"
  on student_profiles for select to authenticated
  using (is_admin());

drop policy if exists "student_profiles: coordinator reads school" on student_profiles;
create policy "student_profiles: coordinator reads school"
  on student_profiles for select to authenticated
  using (student_id in (select coordinator_school_student_ids()));

drop policy if exists "student_profiles: professor reads own students" on student_profiles;
create policy "student_profiles: professor reads own students"
  on student_profiles for select to authenticated
  using (student_id in (select professor_taught_student_ids()));

-- Sprint 2: no parent policy. Sprint 3 will add curated parent visibility
-- via parent_visible_summaries (architecture §16, debt list).

-- ---------- profile_observations (SELECT only + REVOKE DML) ----------

revoke insert, update, delete on profile_observations from authenticated;
revoke insert, update, delete on profile_observations from anon;

drop policy if exists "profile_observations: admin reads" on profile_observations;
create policy "profile_observations: admin reads"
  on profile_observations for select to authenticated
  using (is_admin());

drop policy if exists "profile_observations: coordinator reads school" on profile_observations;
create policy "profile_observations: coordinator reads school"
  on profile_observations for select to authenticated
  using (school_id in (select user_school_ids_as_coordinator()));

drop policy if exists "profile_observations: professor reads own students" on profile_observations;
create policy "profile_observations: professor reads own students"
  on profile_observations for select to authenticated
  using (student_id in (select professor_taught_student_ids()));

-- ---------- bi_weekly_reports (mixed: SELECT for all, UPDATE for coord/admin) ----------

revoke delete on bi_weekly_reports from authenticated;
revoke delete on bi_weekly_reports from anon;

drop policy if exists "bi_weekly_reports: admin reads" on bi_weekly_reports;
create policy "bi_weekly_reports: admin reads"
  on bi_weekly_reports for select to authenticated
  using (is_admin());

drop policy if exists "bi_weekly_reports: admin updates" on bi_weekly_reports;
create policy "bi_weekly_reports: admin updates"
  on bi_weekly_reports for update to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "bi_weekly_reports: coordinator reads school" on bi_weekly_reports;
create policy "bi_weekly_reports: coordinator reads school"
  on bi_weekly_reports for select to authenticated
  using (activity_id in (select coordinator_school_activity_ids()));

drop policy if exists "bi_weekly_reports: coordinator updates school" on bi_weekly_reports;
create policy "bi_weekly_reports: coordinator updates school"
  on bi_weekly_reports for update to authenticated
  using (activity_id in (select coordinator_school_activity_ids()))
  with check (activity_id in (select coordinator_school_activity_ids()));

drop policy if exists "bi_weekly_reports: professor reads own activity" on bi_weekly_reports;
create policy "bi_weekly_reports: professor reads own activity"
  on bi_weekly_reports for select to authenticated
  using (activity_id in (select user_activity_ids_as_professor()));

-- INSERT only via service_role (cron generation). No INSERT policy at all.
-- DELETE revoked above (append-only).

-- ---------- wa_inbox (SELECT only + REVOKE DML) ----------

revoke insert, update, delete on wa_inbox from authenticated;
revoke insert, update, delete on wa_inbox from anon;

drop policy if exists "wa_inbox: admin reads" on wa_inbox;
create policy "wa_inbox: admin reads"
  on wa_inbox for select to authenticated
  using (is_admin());

-- ============================================================
-- 5. Trigger: append_to_profile_observations
--    Fires after a mention_assignment is inserted (post-confirmation).
--    Resolves metadata via class_observations → class_sessions → activities,
--    inserts one row in profile_observations, and upserts student_profiles
--    to (a) guarantee a snapshot row exists and (b) bump observations_count.
-- ============================================================

create or replace function append_to_profile_observations()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_session_id    uuid;
  v_obs_date      date;
  v_school_id     uuid;
  v_professor_id  uuid;
begin
  select co.session_id, cs.scheduled_start_at::date, a.school_id, co.author_id
    into v_session_id, v_obs_date, v_school_id, v_professor_id
  from class_observations co
  join class_sessions cs on cs.id = co.session_id
  join activities a on a.id = cs.activity_id
  where co.id = new.observation_id;

  -- 1) Insert into the normalized source of truth.
  insert into profile_observations (
    student_id, school_id, mention_id, session_id, observed_on,
    sentiment, confidence, content, professor_id
  ) values (
    new.student_id, v_school_id, new.id, v_session_id, v_obs_date,
    new.sentiment, new.ai_confidence, new.content_snippet, v_professor_id
  )
  on conflict (mention_id) do nothing;

  -- 2) Ensure student_profiles row exists and bump denormalized count.
  insert into student_profiles (student_id, observations_count)
  values (new.student_id, 1)
  on conflict (student_id) do update
  set observations_count = student_profiles.observations_count + 1,
      updated_at         = now();

  return new;
end $$;

drop trigger if exists mention_appended_to_profile_observations on mention_assignments;
create trigger mention_appended_to_profile_observations
  after insert on mention_assignments
  for each row execute function append_to_profile_observations();

-- ============================================================
-- 6. Close audit_logs FK deferred from 0005
-- ============================================================

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_related_report_id_fkey'
  ) then
    alter table audit_logs
      add constraint audit_logs_related_report_id_fkey
      foreign key (related_report_id)
      references bi_weekly_reports(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- Verification
-- ============================================================

do $$
declare
  v_student_profiles       int;
  v_profile_observations   int;
  v_bi_weekly_reports      int;
  v_wa_inbox               int;
  v_observations_log_gone  boolean;
  v_enums_new              int;
  v_append_trigger         boolean;
  v_audit_fk_report        boolean;
begin
  select count(*) into v_student_profiles     from student_profiles;
  select count(*) into v_profile_observations from profile_observations;
  select count(*) into v_bi_weekly_reports    from bi_weekly_reports;
  select count(*) into v_wa_inbox             from wa_inbox;

  -- Triple Check verification: the JSONB array column must NOT exist.
  select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_profiles'
      and column_name = 'observations_log'
  ) into v_observations_log_gone;

  -- We created exactly one new enum in this migration (report_status).
  -- observation_sentiment intentionally not created — we reuse mention_sentiment.
  select count(*) into v_enums_new
    from pg_type
    where typname in ('report_status');

  select exists (
    select 1 from pg_trigger
    where tgname = 'mention_appended_to_profile_observations'
  ) into v_append_trigger;

  select exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_related_report_id_fkey'
  ) into v_audit_fk_report;

  raise notice '0007 profile_observations_reports: student_profiles=% profile_observations=% bi_weekly_reports=% wa_inbox=% observations_log_removed=% enums_new=% append_trigger=% audit_fk_report=%',
    v_student_profiles, v_profile_observations, v_bi_weekly_reports, v_wa_inbox,
    v_observations_log_gone, v_enums_new, v_append_trigger, v_audit_fk_report;
end $$;

commit;

-- End of 0007_profile_observations_reports.sql
