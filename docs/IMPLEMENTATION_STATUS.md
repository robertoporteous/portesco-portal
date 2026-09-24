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
| Next.js app shell, routes, layouts         | In repo; all three protected layouts ship with a mobile-first sticky header carrying brand + logout |
| Types + business constants + PRD           | In repo                                        |
| Supabase client packages in `package.json` | `@supabase/supabase-js@2.105.3` + `@supabase/ssr@0.10.2` (exact pins) |
| SQL migrations + RLS                       | `0001_init.sql` + `0002_rls.sql` + `0003_seed.sql` + `0004_fix_rls_recursion.sql` **all applied** to Supabase; 24 SELECT policies live; 1 + 9 `SECURITY DEFINER` helpers in place |
| Demo seed data                             | `0003_seed.sql` **applied**: CIDMI school, 4 activities, 1 admin/parent user, 1 student, 2 enrollments |
| Test parent fixture                        | `supabase/scripts/seed-test-parent.sql` (idempotent, manual run from SQL Editor) — creates parent-pure `ai@portescosports.com` + 1 student + 2 enrollments for RLS isolation tests |
| Magic link auth                            | Wired end-to-end: `/login` → `signInWithOtp` → Resend → callback → `exchangeCodeForSession` → role-based redirect; Spanish email templates configured in Supabase Dashboard |
| Role-based route protection                | `proxy.ts` enforces session + role (`parent` → `/`, `coord`/`prof` → `/staff`, `is_admin` or `role=admin` → `/admin`); `/login`, `/auth/*`, `/api/*` public |
| Parent / staff / admin screens             | Parent `/` is a live Server Component reading children + active enrollments + activity metadata in one nested Supabase query; staff and admin remain placeholders behind the new header until Sprint 2+ |
| Production deploy                          | Vercel auto-deploy on push to `main`; custom domain `app.portescosports.com` with HTTPS; environment variables synced in Vercel dashboard |
| Email delivery                             | Resend SMTP wired through Supabase Auth; sender `noreply@portescosports.com` on `send.portescosports.com` |
| PWA icons / service worker                 | Incomplete                                     |


## Where to focus next (order)

1. ~~Supabase project + migrations + RLS aligned with PRD.~~ **Done 2026-05-06.**
2. ~~Auth (magic link) + session + proxy.~~ **Done 2026-05-20.**
3. ~~One vertical slice: parent sees real child + activities (read-only).~~ **Done 2026-05-20, live on app.portescosports.com.**
4. Sprint 1.5: multi-region + bilingual + multi-currency schema (migration 0005). ← **next up**
5. Sprint 2: Coordinator Pad anchor + Voice→Progress Report satellite + write-side RLS (migration 0006).
6. Staff attendance → then monthly reports → billing last.

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

## Sprint 1 Bloque 2 — closed (2026-05-20)

Acceptance criteria: 11 of 11 ✅ from the original Bloque 2 prompt, validated
end-to-end on a real iPhone Safari session against
`https://app.portescosports.com`.

### Migrations added in Bloque 2

- **`0004_fix_rls_recursion.sql`** — 9 `SECURITY DEFINER` helper functions
  (`parent_child_student_ids`, `parent_child_activity_ids`,
  `user_school_ids_as_coordinator`, `user_activity_ids_as_professor`,
  `user_school_ids_as_member`, `parent_kids_professor_user_ids`,
  `coordinator_school_activity_ids`, `coordinator_school_student_ids`,
  `professor_taught_student_ids`). Drops + recreates the 13 cross-table
  SELECT policies so no `USING` clause still contains a raw sub-select
  across tables. Policy count unchanged at 24. Root cause and the rule
  this introduces are recorded in `AGENTS.md` §9.

### Auth + session

- `lib/supabase/{client,server,middleware}.ts` wired against
  `@supabase/ssr@0.10.2` with the Next.js 16 async `cookies()` API.
- `/login` is a Client Component calling `signInWithOtp` with
  `emailRedirectTo` pointing at `/auth/callback`.
- `/auth/callback` exchanges the PKCE code, reads `public.users.role`
  and `is_admin`, then redirects:
  - `is_admin` or `role='admin'` → `/admin`
  - `role='coordinator' | 'professor'` → `/staff`
  - `role='parent'` or no profile row → `/`
- `proxy.ts` (Next.js 16 successor to `middleware.ts`) refreshes the
  Supabase cookie on every request, then enforces the role rules
  above for protected routes. `/login`, `/auth/*`, and `/api/*` are
  public; everything else requires a session. Redirects preserve any
  `Set-Cookie` headers from session refresh.
- `components/shared/logout-button.tsx` is a Client Component that
  calls `signOut()` and hard-redirects to `/login`. Wired into the
  sticky headers of all three protected layouts so logout is reachable
  on mobile, not only inside desktop sidebars.

### Email delivery

- Resend SMTP integrated through Supabase Auth (Settings → Auth → SMTP).
- Sender domain `send.portescosports.com` with the matching SPF / DKIM
  / DMARC records in DNS. Sender address `noreply@portescosports.com`.
- All five Supabase email templates (magic link, signup confirmation,
  reauthentication, recovery, invite) edited in the Dashboard to plain
  Spanish copy.

### Production deploy

- Vercel project linked to the GitHub repo with auto-deploy on push to
  `main`. Production environment variables in the Vercel dashboard
  match `.env.local` exactly: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_APP_URL=https://app.portescosports.com`.
- Custom domain `app.portescosports.com` via CNAME to Vercel; HTTPS
  certificate issued automatically.
- Supabase Authentication → URL Configuration includes
  `https://app.portescosports.com` as Site URL and the `/auth/callback`
  path in the Redirect Allow List so the production magic link returns
  to the right host.

### RLS isolation test (acceptance criterion #10)

`supabase/scripts/seed-test-parent.sql` (idempotent, run manually from
the Supabase SQL Editor whenever the fixture is needed):

- Looks up `auth.users.id` for `ai@portescosports.com`; raises if the
  magic-link sign-in has not happened yet for that email.
- Upserts a `public.users` row with `role='parent'` and
  `is_admin=false` (defensive against any prior admin flag).
- Find-or-creates the student `Ana Mendoza`, grade 4to, CIDMI school —
  visually distinct from Roberto admin's seed kid (`Estudiante Demo
  Porteous`, 5to).
- Idempotently enrolls Ana in `Basketball` + `Atletismo` (different
  activities from Roberto's kid's `Fútbol` + `Ajedrez`) via the
  `(student_id, activity_id)` unique constraint.

End-to-end validation (Roberto, iPhone Safari, 2026-05-20):

- `ai@portescosports.com` magic-link sign-in reached `/` and rendered
  the empty state ("Aún no tienes estudiantes registrados"), confirming
  RLS denies access by default to a fresh parent.
- After running the seed script, the same session rendered "Hola,
  Carolina" plus a single card for Ana Mendoza with Basketball +
  Atletismo. The seed child of the admin (`Estudiante Demo Porteous`)
  was **not** visible — RLS isolation confirmed.
- Logout from `/`, `/admin`, and `/staff` (re-validated after the
  header fix) returns to `/login`. Browser console clean.

### Known limitations carried into Sprint 2+

- Bottom nav on the parent layout still has placeholder links
  (`Inicio` / `Avance` / `Calendario` / `Noticias` / `Perfil`).
  Functional screens for Avance + Noticias arrive with the Concierge
  surface in Sprint 2; Calendario + Perfil in Sprint 3.
- Staff and admin sidebar nav is desktop-only (`hidden md:flex`).
  Mobile drawer for those nav lists is Sprint 3 work; the sticky
  header keeps logout reachable in the meantime.
- `lib/types.ts` is still behind the schema (no `is_admin` on `User`,
  no `updated_at` on most interfaces). Will be resynced
  opportunistically in Sprint 2 when the first server-side write path
  needs it.
- `next-forge`-style i18n is not yet in place; user-facing strings live
  inline in components. Migration 0005 introduces the bilingual schema
  columns but the i18n runtime layer lands with Sprint 1.5 code.
- No automated tests yet; CI is unconfigured.
- PWA icons and service worker behavior still incomplete.

## Sprint 2 Bloque 3 — closed (2026-09-08)

Voice pipeline + confirmation loop (tasks 1-9). Verified end-to-end in
production 2026-09-08: record → confirmation modal showed the correct
mentions → Confirm → `status='confirmed'` → `mention_assignments =
profile_observations = 2` (**flujo A**: the profile only receives
human-confirmed mentions). Real run observation:
`80234aad-857f-4e51-b7be-302495649ad3`. 100/100 tests green (run twice).
Migration `0009` added (RLS: coordinator sees own-school staff). Full task
breakdown and deferred items (Bloque 4: ThumbsFeedback, Kassandra's COLA,
realtime recovery) live in `AGENTS.md` §8; the pre-launch adversarial code
review gate lives in `AGENTS.md` §12 `GATE(voice-launch)`.

### Pre-launch data cleanup — PENDING (do NOT delete anything yet)

The voice pipeline leaves stuck / orphan rows behind that must be cleaned
**before launch**. Recorded here so a future session runs the cleanup
deliberately, not accidentally mid-sprint. **Nothing is deleted now.**

- **`class_observations` rows stuck in `pending_*` states** (e.g.
  `pending_confirmation`, `pending_extraction`) that were never confirmed
  by a human. In flujo A these are **inert** — mentions are inserted only
  on human confirm, so an unconfirmed row never contaminates a student
  profile — but they are dead weight and should be swept pre-launch.
  - Known stuck row: **`99d4d0bf`** in `pending_extraction` (extraction
    never completed). Left in place intentionally as a diagnostic sample;
    delete during the pre-launch sweep.
- **Orphan audio blobs in the `voice-obs` Storage bucket.** Deleting a
  `class_observations` row does **NOT** cascade to Storage — the DB
  `ON DELETE CASCADE` graph never reaches the bucket (Storage objects are
  not FK-linked to app tables). So every deleted/abandoned observation
  leaves its uploaded audio orphaned in `voice-obs`. The pre-launch sweep
  must reconcile the bucket against surviving `class_observations` and
  delete blobs with no matching row.
- **Sequencing for the sweep:** it depends on the Bloque 4 recovery work
  (`DEBT(bloque-4)` in `AGENTS.md` §12 — a "pendientes de confirmar" view
  or realtime that reopens the modal). Decide per stuck row whether it is
  recoverable-and-wanted before deleting; only then delete the row **and**
  its `voice-obs` blob together. Do not write a blind `DELETE ... WHERE
  status LIKE 'pending_%'` without also clearing the paired audio.
---

## Sprint 3 — Piloto CIDMI, solo asistencia (en curso)

No construye producto. Pone el Coordinator Pad de Bloque 2 en manos de
Kassandra Dos Santos con la data real de CIDMI. Todo lo que produjo son
scripts en `supabase/scripts/` + docs.

### DIA_1 = lunes 28 de septiembre de 2026

**Movido desde el 21 de septiembre** (`reset-dia1-sprint-3.sql`, 24 sep 2026).
Las sesiones se habían generado con DIA_1 = 21 sep, pero el piloto no arrancó:
Kassandra nunca entró (último login 5 jun 2026) y la semana del 21 al 25 pasó
sin una sola marca de asistencia. Esas 18 sesiones se borraron y se agregó la
semana del 19 al 23 de octubre, para que la ventana siga siendo de 4 semanas
completas. Dejarlas habría arrancado la métrica del PRD §6 con tres días de
clases nunca cerradas.

Ventana del piloto: **28 sep – 23 oct 2026** (última clase viernes 23 oct).

### Qué se sembró en prod

| | |
|---|---|
| Actividades | **13 creadas, 10 activas** |
| Students | **162** (38 antes → +124 del roster) |
| Enrollments | **172** en las 10 activas |
| class_sessions | **72** (18 bloques semanales × 4 semanas) |
| class_attendance | **0** — el día 1 arranca en cero |

Modelo: **1 actividad = deporte × nivel** (Primaria / Secundaria). Las
categorías U6…U18 NO son actividades: se derivan de `students.grade` vía
`lib/categories.ts`.

`Fútbol U14-U18` (Sprint 2) se renombró a `Fútbol Secundaria` conservando su id
`ec65a576-af31-4b37-8640-a57a21895668`, sus 36 enrollments y el
`staff_activities` de Alexander.

### 3 actividades desactivadas por quedar sin un solo niño

`Basketball Secundaria`, `Baile Urbano Secundaria`, `Flag Football Secundaria`
→ `is_active = false`. Ningún niño del roster mapea a ellas, y en la planilla de
asistencia esos grupos no tuvieron una sola X en todo 2026: no arrancaron.
La generación de sesiones filtra por `is_active`, así que a Kassandra no le
aparecen clases vacías. Se reactivan con el addendum del generador si confirma
que existen (el addendum prende la actividad antes de insertar).

### Pendientes con Kassandra

Viven en `supabase/scripts/private/pendientes-kassandra.md` — **generado, no
commiteado** (PII). Lo regenera `generate-cidmi-seed.ts`. Secciones:

- **§0** las 3 actividades desactivadas.
- **§1** 2 niños que no se insertaron: no resolvían nivel (sin categoría, sin
  grado y fuera de la whitelist de la regla (c)).
- **§2** 3 a confirmar: un caso de Porrismo en 7mo forzado a Primaria porque
  `Porrismo Secundaria` no existe; un grado en conflicto entre prod y el CSV; y
  un student de prod que no está en el roster y se dejó intacto a propósito
  (borrar un niño real es más caro que un fantasma en la lista unos días).
- **§3** conteos por actividad para cruzar contra su lista. Voleibol y
  Baloncesto quedaron por debajo del cruce del horario; el delta entra por el
  addendum, sin tocar el seed.
- **§5** 39 niños con `grade = 'Sin grado'`. `students.grade` es `text NOT NULL`
  sin CHECK, y **no se inventó** un grado desde el nivel ni la categoría.
  `categoryForGrade()` los agrupa en "Otros".
- **§6** nota operativa: el primer "Enviar" post-deploy en Safari iOS puede
  tirar un error transitorio (AGENTS §9) — reintentar, y no contarlo como
  bloqueo de la métrica si el reintento funciona.

### GATE(voice-launch) — cerrado más fuerte que antes

Bloque 3 dejaba entrar al **coordinator** al surface `/professor` (en `proxy.ts`
y en el layout), con un test que lo fijaba. Se cerró a **professor + admin**
(commit `21aac83`): el piloto le da acceso real a una coordinadora y con la regla
vieja le alcanzaba tipear `/professor` para llegar al grabador. Se revierte con
la COLA de Bloque 4 (T11), pero recién después del code review adversarial.

No hay ningún `href` a `/professor` ni `/voice` fuera del propio surface: el
vector era la URL tipeada, no la UI.

### Lista de mejoras cosméticas — evaluar el día 14 (PRD §5)

No se tocan durante el piloto. Se anotan cuando aparecen y se deciden con las
métricas en mano.

- **El label "N enrolled" está en inglés en una UI en español.** Detectado en el
  smoke manual del 24 sep 2026 (Roberto, como admin, en el Coordinator Pad).
  Cosmético, no bloquea pasar asistencia. Al arreglarlo, revisar si hay otros
  strings sueltos en inglés en el mismo surface antes de tocar uno solo.

### Smoke manual — hecho (24 sep 2026)

Roberto como admin, Chrome. `/coordinator-pad` mostró las 6 clases del jueves
con los conteos exactos (Baile Urbano 13 · Voleibol Prim 12 · Basketball Prim 9
· Flag Football Prim 3 · Fútbol Sec 43 · Voleibol Sec 18). Marcó asistencia y
una eventualidad en Flag Football Primaria, cerró / reabrió / cerró la clase, y
cerró el día: las 6 quedaron cerradas. Acentos y apóstrofes (`D'jilmar`,
`Tomás D'Medeiros`) se renderizan bien.

La asistencia de prueba se borra con `cleanup-smoke-test-sprint-3.sql`.

### Data de prueba con nombres reales — observación 362a8dbe (borrada)

El 22 sep 2026 Roberto probó el surface `/professor` **usando la sesión de
Alexander Watson**, y quedó una `class_observations` (`362a8dbe`, `kind=text_group`,
`"victor palumbo se porto mal"`) atribuida a Alexander en la DB. Data de prueba
con el nombre de un alumno real (Victor Palumbo, 11vo).

Se borró en `reset-dia1-sprint-3.sql` (paso 0), tras verificar
`mention_assignments = 0` y `profile_observations = 0`: se había confirmado
deseleccionando la única mención, así que el perfil del alumno nunca recibió
nada. El row de `audit_logs` **se conserva** — la FK `related_observation_id` es
`ON DELETE SET NULL` y AGENTS §3.3 no admite borrar el rastro de una call al LLM.

Dos cosas que esto destapó:

- **El cleanup del smoke no la veía.** `cleanup-smoke-test-sprint-3.sql` filtra
  por autor (`marked_by`/`created_by`/`closed_by` = Roberto), y esa fila tenía
  `author_id` = Alexander. Filtrar por autor sigue siendo lo correcto: es lo que
  lo hace seguro de correr con Kassandra ya trabajando. El problema era probar
  con la sesión de otro → regla nueva en `AGENTS.md` §9.
- **El guard del reset evitó una pérdida silenciosa.**
  `class_observations.session_id` es `ON DELETE CASCADE`: borrar la sesión se
  habría llevado la observación sin avisar. Por eso el reset aborta si las
  sesiones a borrar tienen datos, en vez de confiar en los conteos previos.

### La métrica del día 14 NO se mide con logins

`users.last_signed_in_at` **subcuenta el uso real.** Evidencia: Alexander tenía
`last_sign_in_at` del 3 sep, y el 22 sep se escribió una observación con su
sesión — el campo sólo se actualiza en un sign-in fresco (magic link), no cuando
la cookie se refresca. Alguien puede usar el Portal semanas sin moverlo.

Por eso la adopción de Kassandra se mide con **`class_attendance` (filas marcadas
por ella) y `class_sessions.closed_at` (clases y días que cerró)**, no con
conteos de login. Es lo que el PRD §6 ya pide; esto queda anotado para que nadie
lo "simplifique" a un conteo de sesiones de auth más adelante.

### Scripts de este sprint, en orden

| # | Script | Estado |
|---|---|---|
| 1 | `cleanup-cidmi-pre-pilot.sql` | corrido (`4f581c8`) |
| 2 | `seed-activities-sprint-3.sql` | corrido (`7acdd0d`) |
| 3 | `generate-cidmi-seed.ts` → `private/seed-cidmi-pilot-sprint-3.sql` | corrido (`1f3df3f`) |
| 4 | `generate-class-sessions-sprint-3.sql` | corrido (`df34fd6`) |
| 5 | `reset-dia1-sprint-3.sql` | mueve DIA_1 al 28 sep |
| 6 | `cleanup-smoke-test-sprint-3.sql` | correr DESPUÉS del smoke y ANTES del día 1 |

**Orden entre 5 y 6:** si el smoke se hizo sobre las clases de la semana del 21,
corré **6 antes que 5**. El guard de 5 aborta si las sesiones a borrar tienen
asistencia, y 6 es lo que la saca.
