-- 0008_fix_class_observations_write_scope.sql
-- PORTESCO Portal — Sprint 2 Bloque 1, security fix
--
-- Closes a defense-in-depth RLS gap discovered while writing the Bloque 1
-- RLS tests (3 junio 2026):
--
--   The 0006 policies "class_observations: author insert own" and
--   "class_observations: author update own" gated writes on
--   `author_id = auth.uid()` only. Because RLS permissive policies are
--   OR-combined and foreign keys do NOT validate RLS on the referenced
--   table, ANY authenticated user could INSERT / UPDATE a class_observations
--   row pointing at ANY session_id — including sessions belonging to
--   schools they have no role in — as long as they wrote their own uid
--   into author_id. The server action would still have to validate scope,
--   but the first line of defense was missing.
--
-- Audit also checked class_attendance, class_eventualities, and
-- mention_assignments:
--   - class_attendance + class_eventualities: write side is locked to
--     "coordinator session" (FOR ALL filtered by coordinator_session_ids()).
--     Professor has SELECT only. No gap.
--   - mention_assignments: INSERT/UPDATE/DELETE filtered by
--     author_observation_ids(). No direct gap, but propagated the
--     class_observations gap indirectly (an injected observation became
--     "yours", so mentions on it passed). Fixing class_observations cuts
--     that chain.
--
-- This migration:
--   1. DROP + CREATE the two affected policies with an additional
--      AND (session_id IN coordinator_session_ids()
--           OR session_id IN professor_session_ids()) clause.
--   2. Verification block that re-reads pg_policies.with_check / qual to
--      confirm the new clauses are present.
--
-- Idempotent (DROP IF EXISTS + CREATE). Wrapped in BEGIN/COMMIT.
--
-- Naming note: Sprint 3 originally reserved 0008 for the bilingual /
-- multi-region migration. That migration becomes 0009. Trivial renumber.

begin;

-- ============================================================
-- 1. Re-create class_observations INSERT policy with session scope
-- ============================================================

drop policy if exists "class_observations: author insert own" on class_observations;
create policy "class_observations: author insert own"
  on class_observations for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      session_id in (select coordinator_session_ids())
      or session_id in (select professor_session_ids())
    )
  );

-- ============================================================
-- 2. Re-create class_observations UPDATE policy with session scope
-- ============================================================

drop policy if exists "class_observations: author update own" on class_observations;
create policy "class_observations: author update own"
  on class_observations for update to authenticated
  using (
    author_id = auth.uid()
    and (
      session_id in (select coordinator_session_ids())
      or session_id in (select professor_session_ids())
    )
  )
  with check (
    author_id = auth.uid()
    and (
      session_id in (select coordinator_session_ids())
      or session_id in (select professor_session_ids())
    )
  );

-- ============================================================
-- Verification
-- ============================================================

do $$
declare
  v_insert_check       text;
  v_update_using       text;
  v_update_with_check  text;
  v_insert_scoped      boolean;
  v_update_scoped      boolean;
begin
  select with_check into v_insert_check
    from pg_policies
    where schemaname = 'public'
      and tablename = 'class_observations'
      and policyname = 'class_observations: author insert own';

  select qual, with_check into v_update_using, v_update_with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = 'class_observations'
      and policyname = 'class_observations: author update own';

  v_insert_scoped :=
    v_insert_check is not null
    and v_insert_check like '%coordinator_session_ids%'
    and v_insert_check like '%professor_session_ids%';

  v_update_scoped :=
    v_update_using is not null
    and v_update_using like '%coordinator_session_ids%'
    and v_update_using like '%professor_session_ids%'
    and v_update_with_check is not null
    and v_update_with_check like '%coordinator_session_ids%'
    and v_update_with_check like '%professor_session_ids%';

  raise notice '0008 fix_class_observations_write_scope: insert_policy_scoped=% update_policy_scoped=%',
    v_insert_scoped, v_update_scoped;
end $$;

commit;

-- End of 0008_fix_class_observations_write_scope.sql
