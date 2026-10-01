-- 0010_events_news_parent_read.sql
-- PORTESCO Portal — Sprint 4 (Preview Tech Week), T1
--
-- NUMERACIÓN: 0010 es el próximo número libre (0001-0009 ocupados). El batch
-- multi-region que architecture §16 reservaba para "0008/0009" corre a 0011+.
--
-- QUÉ HACE (eje "mi colegio" del lado padre — Concierge):
--   1. Enums event_type y news_kind.
--   2. Tablas events y news_items (una fila = un evento / una noticia de UN
--      colegio; activity_id opcional para scoping fino). Ambas llevan las 4
--      columnas bilingües de AGENTS §3.2 sobre su texto user-facing
--      (description / body), nullable con default 'es'.
--      news_items.body es PLAIN TEXT (AGENTS §4: nada de markdown a padres).
--   3. Helper parent_child_school_ids(): school_ids de los hijos del caller.
--   4. Policies SELECT:
--        events / news_items → admin · coordinator (sus escuelas) · parent
--          (escuelas de sus hijos, solo is_published)
--        class_sessions      → parent lee sesiones de actividades de sus hijos
--        class_attendance    → parent lee asistencia de sus propios hijos
--        activities          → parent lee el catálogo ACTIVO de las escuelas
--          de sus hijos (hoy solo ve las actividades donde está inscrito;
--          el eje "mi colegio" necesita ver todas)
--      Admin y coordinator tienen FOR ALL en events/news_items (publicar desde
--      Studio o, Sprint 5+, desde admin UI). Parent NUNCA escribe.
--
-- LEAK VECTORS revisados:
--   - events/news_items no contienen PII de menores (son del colegio).
--   - class_attendance al padre: policy por student_id ∈ parent_child_student_ids()
--     → un padre no ve filas de otros niños aunque compartan sesión.
--   - class_sessions al padre: por activity_id ∈ parent_child_activity_ids().
--     Expone scheduled_start/end, closed_at, closed_by (uuid del coordinator).
--     closed_by no resuelve a nombre salvo que users tenga policy para ese id
--     (hoy: parent solo ve profesores de sus hijos, 0004). Aceptable.
--   - activities catálogo: expone nombre, horario, precio de actividades del
--     colegio de su hijo. Es información pública del programa. Aceptable.
--
-- RECURSIÓN (AGENTS §9): ninguna policy hace sub-SELECT directo contra otra
--   tabla; todo pasa por helpers SECURITY DEFINER. Orden: enums → tablas →
--   helper (language sql resuelve en CREATE; students/enrollments ya existen)
--   → policies → verificación.
--
-- Idempotente: enums en DO blocks, CREATE TABLE IF NOT EXISTS, DROP POLICY IF
--   EXISTS antes de cada CREATE, CREATE INDEX IF NOT EXISTS.

begin;

-- ============================================================
-- 1. Enums
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type event_type as enum (
      'match', 'tournament', 'practice', 'festival', 'meeting', 'other'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'news_kind') then
    create type news_kind as enum (
      'announcement', 'result', 'photo', 'promo', 'payment_reminder'
    );
  end if;
end $$;

-- ============================================================
-- 2. Tablas
-- ============================================================

-- events — calendario del colegio: partidos, torneos, festivales, reuniones.
-- Las PRÁCTICAS regulares NO viven aquí (son class_sessions); 'practice' existe
-- para prácticas extraordinarias (amistoso, entrenamiento especial).
create table if not exists events (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references schools(id) on delete restrict,
  activity_id             uuid references activities(id) on delete set null,
  title                   text not null,
  description             text,
  event_type              event_type not null default 'other',
  starts_at               timestamptz not null,
  ends_at                 timestamptz,
  location                text,
  is_published            boolean not null default true,
  created_by              uuid references users(id),
  -- Bilingüe (AGENTS §3.2) sobre description
  original_lang           text default 'es',
  display_lang            text default 'es',
  translated_text         text,
  translation_confidence  real,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint events_ends_after_starts check (ends_at is null or ends_at >= starts_at)
);

create index if not exists events_school_starts_idx on events (school_id, starts_at);

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

alter table events enable row level security;

-- news_items — feed del colegio. body es plain text.
create table if not exists news_items (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references schools(id) on delete restrict,
  activity_id             uuid references activities(id) on delete set null,
  kind                    news_kind not null default 'announcement',
  title                   text not null,
  body                    text,
  image_url               text,
  link_url                text,
  link_label              text,
  is_published            boolean not null default true,
  published_at            timestamptz not null default now(),
  created_by              uuid references users(id),
  -- Bilingüe (AGENTS §3.2) sobre body
  original_lang           text default 'es',
  display_lang            text default 'es',
  translated_text         text,
  translation_confidence  real,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists news_items_school_published_idx on news_items (school_id, published_at desc);

drop trigger if exists news_items_set_updated_at on news_items;
create trigger news_items_set_updated_at
  before update on news_items
  for each row execute function set_updated_at();

alter table news_items enable row level security;

-- ============================================================
-- 3. Helper
-- ============================================================

-- school_ids de los hijos del caller (parent). Mismo hardening que 0004.
-- Used by: events.parent, news_items.parent, activities.parent catalog
create or replace function public.parent_child_school_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select distinct s.school_id
  from public.students s
  where s.parent_id = auth.uid()
    and s.is_active;
$$;

revoke execute on function public.parent_child_school_ids() from public;
grant  execute on function public.parent_child_school_ids() to authenticated;

-- ============================================================
-- 4. Policies
-- ============================================================

-- ---------- events ----------

drop policy if exists "events: admin" on events;
create policy "events: admin"
  on events for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "events: coordinator school" on events;
create policy "events: coordinator school"
  on events for all to authenticated
  using (school_id in (select user_school_ids_as_coordinator()))
  with check (school_id in (select user_school_ids_as_coordinator()));

drop policy if exists "events: parent sees published of kids' schools" on events;
create policy "events: parent sees published of kids' schools"
  on events for select to authenticated
  using (is_published and school_id in (select parent_child_school_ids()));

-- ---------- news_items ----------

drop policy if exists "news_items: admin" on news_items;
create policy "news_items: admin"
  on news_items for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "news_items: coordinator school" on news_items;
create policy "news_items: coordinator school"
  on news_items for all to authenticated
  using (school_id in (select user_school_ids_as_coordinator()))
  with check (school_id in (select user_school_ids_as_coordinator()));

drop policy if exists "news_items: parent sees published of kids' schools" on news_items;
create policy "news_items: parent sees published of kids' schools"
  on news_items for select to authenticated
  using (is_published and school_id in (select parent_child_school_ids()));

-- ---------- class_sessions (nueva visibilidad parent) ----------

drop policy if exists "class_sessions: parent select kids' activities" on class_sessions;
create policy "class_sessions: parent select kids' activities"
  on class_sessions for select to authenticated
  using (activity_id in (select parent_child_activity_ids()));

-- ---------- class_attendance (nueva visibilidad parent) ----------

drop policy if exists "class_attendance: parent select own kids" on class_attendance;
create policy "class_attendance: parent select own kids"
  on class_attendance for select to authenticated
  using (student_id in (select parent_child_student_ids()));

-- ---------- activities (catálogo del colegio para el padre) ----------
-- Permissive → OR con "activities: parent sees activities of own kids" (0004).

drop policy if exists "activities: parent sees active catalog of kids' schools" on activities;
create policy "activities: parent sees active catalog of kids' schools"
  on activities for select to authenticated
  using (is_active and school_id in (select parent_child_school_ids()));

-- ============================================================
-- 5. Verificación
-- ============================================================

do $$
declare
  n_pol int;
begin
  if to_regclass('public.events') is null or to_regclass('public.news_items') is null then
    raise exception '0010: tablas events / news_items no existen tras el CREATE';
  end if;

  select count(*) into n_pol
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'events: admin',
      'events: coordinator school',
      'events: parent sees published of kids'' schools',
      'news_items: admin',
      'news_items: coordinator school',
      'news_items: parent sees published of kids'' schools',
      'class_sessions: parent select kids'' activities',
      'class_attendance: parent select own kids',
      'activities: parent sees active catalog of kids'' schools'
    );

  if n_pol <> 9 then
    raise exception '0010: se esperaban 9 policies nuevas, hay %', n_pol;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'parent_child_school_ids'
  ) then
    raise exception '0010: helper parent_child_school_ids() no existe';
  end if;
end $$;

commit;

-- End of 0010_events_news_parent_read.sql
