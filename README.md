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

The repository now has a working **foundation database layer** running against
a real Supabase project: schema migrations, row-level security policies, and a
small demo seed are all applied and verified. Auth wiring and the parent
dashboard read path land next.

Magic-link authentication, the parent vertical slice (read-only dashboard
sourced from the live database), and production deployment are still pending —
those close out Sprint 1.

## What Exists Today

- Next.js 16 (Proxy convention) + React 19 + TypeScript App Router project.
- Tailwind CSS 4 and PORTESCO brand tokens.
- Parent, staff, and admin route groups.
- Mobile parent layout with bottom navigation.
- Staff and admin layouts with side navigation.
- Login screen prepared for magic link authentication.
- TypeScript business entities for schools, activities, students, attendance,
  reports, events, news, and photos.
- Business constants for grades, activity categories, metrics, attendance
  states, ratings, payment rules, and seed schools.
- PWA manifest.
- Initial API stubs for auth, cron, and webhook routes.
- **Supabase client packages installed:** `@supabase/supabase-js@2.105.3` and
  `@supabase/ssr@0.10.2` (exact pins).
- **SQL migrations applied to a live Supabase project**
  (`supabase/migrations/0001_init.sql`, `0002_rls.sql`, `0003_seed.sql`):
  7 tables, 3 enums, RLS enabled on every table, 24 SELECT-only policies
  covering parent / coordinator / professor / admin-override, and a
  CIDMI demo seed (1 school, 4 activities, 1 user, 1 student,
  2 enrollments).
- Full product requirements document:
  [`PORTESCO_Parent_Portal_PRD.md`](./PORTESCO_Parent_Portal_PRD.md).
- Engineering status with Sprint 1 schema decisions:
  [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md).

## Still Pending

- Wire magic-link authentication end-to-end (callback, session refresh in
  `proxy.ts`, role-based redirects).
- Translate Supabase email templates to Spanish.
- Replace the parent placeholder dashboard with a server-rendered slice
  reading the live database (children + their enrolled activities).
- Production deployment to Vercel and DNS for `app.portescosports.com`.
- INSERT / UPDATE / DELETE RLS policies (deferred to Sprint 2 alongside
  Attendo and admin CRUD).
- Build the rest of the surfaces: Attendo (attendance), Impulso (monthly
  reports), PORTESCOpay (billing).
- Add real PWA icons and service worker behavior.
- Add tests and continuous integration.

## Stack

- **Frontend:** Next.js 16 (Proxy convention), App Router, React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **UI utilities:** shadcn, Base UI, lucide-react
- **Backend:** Supabase (Postgres + Auth + Storage + RLS) — schema and read-only
  RLS live; auth wiring next
- **Planned hosting:** Vercel
- **Target experience:** mobile-first PWA

## Roadmap

- [x] PRD and user flows
- [x] Route structure for parent, staff, and admin portals
- [x] Visual skeleton and brand tokens
- [x] Supabase schema and migrations (`0001_init.sql`)
- [x] Row-level security policies — read-only (`0002_rls.sql`)
- [x] CIDMI demo seed (`0003_seed.sql`)
- [ ] Supabase Auth with magic link
- [ ] Role-based route protection in `proxy.ts`
- [ ] Sprint 1: parent dashboard with real data
- [ ] Sprint 2: attendance workflow (Attendo) + write-side RLS
- [ ] Sprint 3: monthly progress reports (Impulso)
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
