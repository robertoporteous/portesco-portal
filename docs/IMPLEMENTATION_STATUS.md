# Implementation status (engineering)

This file is the **factual build audit**: what is wired vs stub, what is designed
only on paper, and what is left to decide. It is **not** the product pitch; for
that, read the root `[README.md](../README.md)` and
`[PORTESCO_Parent_Portal_PRD.md](../PORTESCO_Parent_Portal_PRD.md)`.

Keep this document updated when you merge backend work or change scope. If you
maintain a longer checklist (school-by-school data, payments, notifications),
add it **below** the snapshot or link to an internal doc.

## Snapshot (sync with repo periodically)


| Area                                       | Status                                         |
| ------------------------------------------ | ---------------------------------------------- |
| Next.js app shell, routes, layouts         | In repo                                        |
| Types + business constants + PRD           | In repo                                        |
| Supabase client packages in `package.json` | `@supabase/supabase-js@2.105.3` + `@supabase/ssr@0.10.2` (exact pins) |
| SQL migrations + RLS                       | `0001_init.sql` + `0002_rls.sql` **applied** to Supabase (24 SELECT policies live, deny-all by default) |
| Demo seed data                             | `0003_seed.sql` **applied**: CIDMI school, 4 activities, 1 admin/parent user, 1 student, 2 enrollments |
| Magic link auth                            | UI + API stub; not calling Supabase Auth yet  |
| Role-based route protection                | Documented; permissive in code                 |
| Parent / staff / admin screens             | Mostly placeholders until data layer is wired  |
| PWA icons / service worker                 | Incomplete                                     |


## Where to focus next (order)

1. ~~Supabase project + migrations + RLS aligned with PRD.~~ **Done 2026-05-06.**
2. Auth (magic link) + session + proxy. ← **next up**
3. One vertical slice: parent sees real child + activities (read-only).
4. Staff attendance → then monthly reports → billing last.

## Note on naming

If you previously used `product_vision.md` for this kind of content, rename or
replace it with this file so **“vision”** stays short (README + PRD) and
**“status”** stays honest and technical.

## Sprint 1 — schema decisions (recorded 2026-05-06)

These are the load-bearing choices behind `supabase/migrations/0001_init.sql`.
Revisit them if requirements shift; do not change them silently.

### A. User roles → single enum + `is_admin` boolean override

`public.users.role` is a single `user_role` enum (`parent | coordinator |
professor | admin`) plus a `is_admin boolean default false` column for the
admin-override case. Today the only multi-role user is the founder
(parent **and** admin); CIDMI policy is that coordinators/professors are
not parents at the same school, so a clean separation is fine. If a real
multi-role edge case appears later, add a migration that converts to an
array column.

Trade-off: the `lib/types.ts` `User` interface needs a new `is_admin`
field — pending update next time we touch the auth flow.

### B. Email templates in Spanish — deferred to Auth step (Week 2)

Supabase email templates (magic link, confirm, recovery, invite) will be
edited in the Supabase Dashboard during the Auth implementation, not at
schema-init time. **Reminder for whoever picks up Auth:** translate all
five templates and run a smoke test before the first real magic-link send.

### C. RLS enabled at table-creation time, deny-all until `0002_rls.sql`

Every table created in `0001_init.sql` runs `ALTER TABLE ... ENABLE ROW
LEVEL SECURITY` immediately, with **no policies defined**. Postgres
default behavior is then "deny all" for non-superuser roles, including
the `anon` and `authenticated` roles used by the Supabase JS client.

Practical consequence: between applying `0001_init.sql` and
`0002_rls.sql`, the seed migration (`0003_seed.sql`) **must** run with
the `service_role` key, which bypasses RLS. Local dev: use
`supabase db reset` or run via Supabase Studio's SQL editor while signed
in as the project owner.

### D. Schema = `public`

Tables live in the default `public` schema. This is the Supabase
default, which means the JS client picks them up with no extra
configuration. If we later need to isolate app tables from extension
artifacts or add a separate `audit` / `billing` schema, that's a
non-destructive add-on migration.

## Sprint 1 — schema notes for `0001_init.sql`

- 7 tables: `schools`, `users`, `students`, `activities`, `enrollments`,
  `staff_schools`, `staff_activities`.
- 3 enums: `user_role`, `activity_category`, `enrollment_status`.
  `staff_schools.role` reuses `user_role` with a `CHECK (role IN
  ('coordinator', 'professor'))` instead of a fourth enum.
- Every table has `created_at` and (where it makes sense) `updated_at`,
  driven by a shared `set_updated_at()` trigger.
- FK ON DELETE choices:
  - `users.id → auth.users(id)`: **cascade** (Supabase pattern).
  - `students.school_id`, `students.parent_id`, `activities.school_id`,
    `enrollments.activity_id`: **restrict** (prevent accidental data
    loss on parent/school deletion).
  - `enrollments.student_id`, `staff_*.user_id`, `staff_*.school_id`,
    `staff_*.activity_id`: **cascade** (junction rows die with their
    parent).
- Indexes added beyond PK/UNIQUE/FK: `students(parent_id)`,
  `students(school_id)`, partial `activities(school_id) WHERE
  is_active`, `enrollments(student_id)`, `enrollments(activity_id)`,
  `staff_schools(user_id)`, `staff_schools(school_id)`,
  `staff_activities(user_id)`, `staff_activities(activity_id)`.
- `lib/types.ts` will drift from the schema until updated:
  add `updated_at` to most interfaces, add `is_admin` to `User`,
  add `created_at`/`updated_at` to `Enrollment` and the staff junctions.
  Done in a follow-up commit after migrations are applied.

## Sprint 1 — foundation applied (2026-05-06)

All three Sprint 1 migrations have been executed against the live Supabase
project and verified visually in Table Editor / Authentication panel.

### Migrations applied, in order

1. **`0001_init.sql`** — extensions, 3 enums, 7 tables, indexes,
   `set_updated_at()` trigger, RLS enabled (deny-all) on every table.
   Verification: 7 tables visible in Table Editor, all marked with the
   RLS-enabled icon.
2. **`0002_rls.sql`** — `is_admin()` SECURITY DEFINER helper plus 24
   SELECT-only policies covering parent / coordinator / professor /
   admin-override across the 7 tables. INSERT / UPDATE / DELETE
   intentionally not yet allowed; those land in Sprint 2 alongside
   Attendo and the admin CRUD. Verification: 24 policies listed in
   Authentication → Policies, all SELECT, all targeting `authenticated`.
3. **`0003_seed.sql`** — demo data for CIDMI:
   - 1 school (`Colegio María Inmaculada`, slug `cidmi`).
   - 4 activities: Fútbol $25 (Lun/Mié 3:00-4:00 PM), Basketball $30
     (Mar/Jue 3:00-4:00 PM), Atletismo $25 (Vie 3:00-4:30 PM),
     Ajedrez $25 (Lun 3:00-4:00 PM).
   - 1 user: `roberto.porteous.bim@gmail.com`, `role='parent'`,
     `is_admin=true`, `full_name='Roberto Porteous'`.
   - 1 student: `Estudiante Demo Porteous`, `grade='5to'`, parent =
     Roberto, school = CIDMI.
   - 2 enrollments: student → Fútbol and student → Ajedrez, status
     `active`.
   Verification: 1 / 1 / 4 / 1 / 2 row counts confirmed in Table Editor.

### Seed prerequisite (manual, one-time per Supabase project)

`0003_seed.sql` resolves the parent's `auth.users.id` by email via CTE,
which means the auth user must exist before the seed runs. For the
current project, the row was created from the Dashboard with these
exact settings (record this if you ever rebuild the project):

- Authentication → Users → Add user → Create new user
- Email: `roberto.porteous.bim@gmail.com`
- Password: throwaway (≥6 chars; never used — login path is magic link)
- **Auto Confirm User: ON**

The seed includes a `RAISE EXCEPTION` pre-flight that aborts the whole
transaction if this row is missing, so a forgotten Dashboard step fails
loudly rather than producing partial data.

### What Sprint 1 does **not** include yet (and where it goes)

- Magic-link Auth wiring (Supabase email templates in Spanish, callback,
  session refresh in `proxy.ts`) — **next step in Sprint 1**, Week 2.
- Parent dashboard reading real data — Week 3 of Sprint 1.
- INSERT / UPDATE / DELETE RLS policies — Sprint 2 (driven by Attendo).
- `lib/types.ts` resync with schema (`is_admin`, `updated_at` everywhere)
  — opportunistic, expected during the first server query that needs it.