# PORTESCO Operating Platform

Operational platform for PORTESCO Sports, an outsourced extracurricular
activities operator running sports, arts, and academic programs for **13 partner
schools and 950+ students** in Panama.

## Product Vision

PORTESCO already runs the operation. Parent communication is the main pain
point today: information lives across WhatsApp, Google Sheets, email, and manual
follow-up. This platform is designed to digitize the parts of the business that
do not scale cleanly as enrollment grows.

The long-term vision is a unified platform with four surfaces sharing the same
data layer:

- **Parent Portal:** families track enrollment, schedules, attendance, progress
  reports, news, and billing status.
- **Attendo:** coaches and coordinators log daily attendance from their phones.
- **Impulso:** coaches upload monthly progress reports and parents read them.
- **PORTESCOpay:** internal billing and payment tracking.

## Current Status

**Sprint 1 closed (2026-05-20).** The portal is live in production at
[`app.portescosports.com`](https://app.portescosports.com) with magic-link
auth, the parent read-only vertical slice rendering data from Supabase,
role-based route protection, and RLS-enforced isolation between parents
verified with two distinct accounts on a real iPhone.

Sprint 2 is next: Coordinator Pad v1 (anchor) plus Voice → Progress
Report (satellite), with the four Plan v2.0 build adjustments (WhatsApp
ingest lite, telemetry on AI drafts, thumbs feedback, audit logs + PII
redaction).

## What Exists Today

- Next.js 16 (Proxy convention) + React 19 + TypeScript App Router project.
- Tailwind CSS 4 and PORTESCO brand tokens.
- Parent, staff, and admin route groups, each with a sticky mobile-first
  header carrying the brand label and the logout button.
- Mobile parent layout with bottom navigation; staff and admin add a
  desktop-only sidebar for navigation.
- **Magic-link authentication wired end-to-end** with Supabase Auth and
  Resend-backed email delivery from `send.portescosports.com` — Spanish
  templates configured in the Supabase Dashboard.
- **`/auth/callback`** exchanges the PKCE code for a session and
  redirects by role: `parent` → `/`, `coordinator|professor` → `/staff`,
  `is_admin` or `role=admin` → `/admin`.
- **`proxy.ts`** refreshes the auth cookie on every request, gates
  protected routes, and enforces role-based access against the live
  `public.users.role` / `is_admin` columns. `/login`, `/auth/*`, `/api/*`
  are public; everything else requires a session.
- **Parent vertical slice** at `/`: a Server Component that reads the
  current user's children + active enrollments + activity metadata in a
  single nested Supabase query, with `loading.tsx`, `error.tsx`, and an
  empty-state copy for new parents.
- **Supabase client packages installed:** `@supabase/supabase-js@2.105.3`
  and `@supabase/ssr@0.10.2` (exact pins).
- **SQL migrations applied to a live Supabase project**
  (`supabase/migrations/0001_init.sql`, `0002_rls.sql`, `0003_seed.sql`,
  `0004_fix_rls_recursion.sql`): 7 tables, 3 enums, RLS enabled on every
  table, 24 SELECT-only policies covering parent / coordinator /
  professor / admin-override, and the `is_admin()` helper plus 9
  `SECURITY DEFINER` helpers added in 0004 to break a cross-table policy
  recursion loop. CIDMI demo seed: 1 school, 4 activities, 1 admin/parent
  user, 1 student, 2 enrollments.
- **Test parent fixture script** at `supabase/scripts/seed-test-parent.sql`
  for re-creating the `ai@portescosports.com` parent + Ana Mendoza
  student + 2 enrollments used in RLS isolation testing.
- **Production deploy on Vercel** at
  [`app.portescosports.com`](https://app.portescosports.com), auto-built
  on every push to `main`, with HTTPS and a Resend-backed SMTP for auth
  emails.
- **`/api/health`** smoke-test route confirms live Supabase connectivity
  (`{"ok":true,"schools_count":N}`).
- TypeScript business entities for schools, activities, students,
  attendance, reports, events, news, and photos.
- Business constants for grades, activity categories, metrics,
  attendance states, ratings, payment rules, and seed schools.
- PWA manifest.
- Initial API stubs for cron and webhook routes.
- Full product requirements document:
  [`PORTESCO_Parent_Portal_PRD.md`](./PORTESCO_Parent_Portal_PRD.md).
- Engineering status with Sprint 1 schema decisions and Bloque 2 closeout:
  [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md).

## Still Pending

Sprint 1.5 (migration 0005):

- Multi-region, bilingual, and multi-currency schema (regions table,
  `original_lang` / `display_lang` / `translated_text` columns on
  user-facing text, currency on activities/billing).

Sprint 2 (Coordinator Pad anchor + Voice → Progress Report satellite,
migration 0006):

- INSERT / UPDATE / DELETE RLS policies (deferred from Sprint 1 — write
  paths begin with Coordinator Pad).
- `class_observations`, `audit_logs`, `student_profiles` tables.
- Anthropic + OpenAI SDKs install (Claude drafting + Whisper voice).
- WhatsApp ingest lite, telemetry on AI drafts, thumbs feedback, PII
  redaction (the four Plan v2.0 build adjustments).

Carry-overs from Sprint 1 deferred to later sprints:

- Mobile drawer for the staff and admin sidebar nav — Sprint 3.
- Bottom-nav links on the parent layout still point to placeholders;
  the dedicated Avance / Calendario / Noticias / Perfil screens land
  with the Concierge surface in Sprint 2-3.
- Real PWA icons and service worker behavior.
- Tests and continuous integration.
- PORTESCOpay surface — Sprint 4+.

## Stack

- **Frontend:** Next.js 16 (Proxy convention), App Router, React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **UI utilities:** shadcn, Base UI, lucide-react
- **Backend:** Supabase (Postgres + Auth + Storage + RLS) — schema, RLS,
  and magic-link auth all live
- **Email delivery:** Resend SMTP (`send.portescosports.com`)
- **Hosting:** Vercel, auto-deploy on push to `main`,
  custom domain `app.portescosports.com` with HTTPS
- **Target experience:** mobile-first PWA

## Roadmap

- [x] PRD and user flows
- [x] Route structure for parent, staff, and admin portals
- [x] Visual skeleton and brand tokens
- [x] Supabase schema and migrations (`0001_init.sql`)
- [x] Row-level security policies — read-only (`0002_rls.sql`)
- [x] CIDMI demo seed (`0003_seed.sql`)
- [x] RLS recursion fix via `SECURITY DEFINER` helpers (`0004_fix_rls_recursion.sql`)
- [x] Supabase Auth with magic link (Resend SMTP, Spanish templates)
- [x] Role-based route protection in `proxy.ts`
- [x] Sprint 1: parent dashboard with real data
- [x] Vercel production deploy + `app.portescosports.com` custom domain
- [x] RLS parent isolation verified end-to-end with 2 accounts on iPhone
- [ ] Sprint 1.5: multi-region + bilingual + multi-currency schema (0005)
- [ ] Sprint 2: Coordinator Pad v1 + Voice→Progress Report + write-side RLS (0006)
- [ ] Sprint 3: monthly progress reports (Impulso) end-to-end
- [ ] Sprint 4: billing (PORTESCOpay)
- [ ] Beta with pilot schools

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Useful scripts:

```bash
npm run lint
npm run build
npm run start
```

## Product Scope

The planned product supports three user groups:

- **Parents:** view children, activities, schedules, progress, news, and billing
  status.
- **Coordinators and professors:** take attendance, submit monthly reports, and
  view assigned students.
- **Admin:** manage schools, students, staff, reports, events, news, and global
  operational metrics.

## Links

- PORTESCO website: <https://robertoporteous.github.io/Portescosports>
- Detailed implementation audit: [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md)
