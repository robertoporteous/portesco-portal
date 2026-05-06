-- 0001_init.sql
-- PORTESCO Portal — initial schema (Sprint 1)
-- Schema: public
-- Creates: extensions, enums, 7 base tables, indexes, updated_at trigger,
--          and enables RLS deny-all on every table (policies live in 0002_rls.sql).
--
-- Idempotency: this migration is NOT idempotent. To re-run, reset the database.
-- Seed (schools, users, students, activities, enrollments) lives in 0003_seed.sql
-- and must run with the service_role key (bypasses RLS).

-- ============================================================
-- Extensions
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- Enums
-- ============================================================

create type user_role as enum ('parent', 'coordinator', 'professor', 'admin');
create type activity_category as enum ('deporte', 'arte', 'academico', 'cuidado');
create type enrollment_status as enum ('active', 'trial', 'withdrawn', 'suspended');

-- ============================================================
-- Helper: set updated_at on row update
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- schools — tenant root
-- ============================================================

create table schools (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  logo_url            text,
  primary_color       text not null default '#1E3A8A',
  secondary_color     text not null default '#E31E24',
  bank_account        text,
  yappy_handle        text not null default '@Portescosports',
  contact_phone       text,
  coordination_phone  text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger schools_set_updated_at
  before update on schools
  for each row execute function set_updated_at();

-- ============================================================
-- users — app-side profile mirror of auth.users
-- ============================================================
-- Decision A: single role enum + is_admin override (see docs/IMPLEMENTATION_STATUS.md).
-- The id column references auth.users(id); a row in public.users is created
-- explicitly (seed today, invitation flow later) — no auto-mirror trigger.

create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  phone       text,
  role        user_role not null,
  is_admin    boolean not null default false,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- ============================================================
-- students — parent-owned, school-scoped
-- ============================================================

create table students (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete restrict,
  parent_id       uuid not null references users(id) on delete restrict,
  full_name       text not null,
  grade           text not null,
  date_of_birth   date,
  avatar_url      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger students_set_updated_at
  before update on students
  for each row execute function set_updated_at();

create index students_parent_id_idx on students(parent_id);
create index students_school_id_idx on students(school_id);

-- ============================================================
-- activities — catalog per school
-- ============================================================

create table activities (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete restrict,
  name            text not null,
  category        activity_category not null,
  monthly_price   numeric(10, 2) not null,
  school_payment  numeric(10, 2) not null default 0,
  schedule        text,
  days_of_week    text[],
  start_time      time,
  end_time        time,
  min_students    int not null default 0,
  max_students    int,
  icon            text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger activities_set_updated_at
  before update on activities
  for each row execute function set_updated_at();

create index activities_school_id_active_idx
  on activities(school_id)
  where is_active = true;

-- ============================================================
-- enrollments — junction student↔activity with status
-- ============================================================

create table enrollments (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students(id) on delete cascade,
  activity_id    uuid not null references activities(id) on delete restrict,
  status         enrollment_status not null default 'active',
  enrolled_at    timestamptz not null default now(),
  withdrawn_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (student_id, activity_id)
);

create trigger enrollments_set_updated_at
  before update on enrollments
  for each row execute function set_updated_at();

create index enrollments_student_id_idx  on enrollments(student_id);
create index enrollments_activity_id_idx on enrollments(activity_id);

-- ============================================================
-- staff_schools — which staff work at which school(s)
-- ============================================================
-- The role column is constrained to coordinator/professor (admins do not
-- need a row here; their access is global via users.is_admin).

create table staff_schools (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  school_id   uuid not null references schools(id) on delete cascade,
  role        user_role not null check (role in ('coordinator', 'professor')),
  created_at  timestamptz not null default now(),
  unique (user_id, school_id)
);

create index staff_schools_user_id_idx   on staff_schools(user_id);
create index staff_schools_school_id_idx on staff_schools(school_id);

-- ============================================================
-- staff_activities — which professor teaches which activity
-- ============================================================

create table staff_activities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  activity_id  uuid not null references activities(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (user_id, activity_id)
);

create index staff_activities_user_id_idx     on staff_activities(user_id);
create index staff_activities_activity_id_idx on staff_activities(activity_id);

-- ============================================================
-- Row Level Security: enable on every table (deny-all by default)
-- ============================================================
-- No policies are defined here. Until 0002_rls.sql runs, only the
-- service_role key (which bypasses RLS) can read or write these tables.

alter table schools          enable row level security;
alter table users            enable row level security;
alter table students         enable row level security;
alter table activities       enable row level security;
alter table enrollments      enable row level security;
alter table staff_schools    enable row level security;
alter table staff_activities enable row level security;

-- End of 0001_init.sql
