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

This repository is in early development. It currently contains the product PRD,
the main route structure, visual layouts, business types, brand tokens, and
placeholder screens for the parent, staff, and admin portals.

The app is not production-ready yet. Supabase authentication, database
migrations, row-level security, real data loading, and complete user workflows
are still pending.

## What Exists Today

- Next.js App Router project with TypeScript.
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
- Full product requirements document:
  [`PORTESCO_Parent_Portal_PRD.md`](./PORTESCO_Parent_Portal_PRD.md).

## Still Pending

- Install and configure Supabase packages.
- Create real Supabase SQL migrations and RLS policies.
- Implement magic link authentication.
- Protect routes by role.
- Replace placeholder screens with functional data-driven views.
- Build CRUD workflows for students, activities, attendance, reports, events,
  news, and staff.
- Add real PWA icons and service worker behavior.
- Add tests and production deployment configuration.

## Stack

- **Frontend:** Next.js 16, App Router, React 19, TypeScript
- **Styling:** Tailwind CSS 4
- **UI utilities:** shadcn, Base UI, lucide-react
- **Planned backend:** Supabase, PostgreSQL, Auth, Storage, Row-Level Security
- **Planned hosting:** Vercel
- **Target experience:** mobile-first PWA

## Roadmap

- [x] PRD and user flows
- [x] Route structure for parent, staff, and admin portals
- [x] Visual skeleton and brand tokens
- [ ] Supabase schema and migrations
- [ ] Supabase Auth with magic link
- [ ] Role-based route protection
- [ ] Sprint 1: parent dashboard with real data
- [ ] Sprint 2: coach progress reports
- [ ] Sprint 3: attendance workflow
- [ ] Sprint 4: billing module
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
