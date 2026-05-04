# PORTESCO Operating Platform

The operational platform for PORTESCO Sports — an outsourced extracurricular activities operator running sports, arts, and academic programs for 13 schools and 950+ students in Panama.

## Vision

A unified platform with four surfaces sharing the same data layer:

- **Parent Portal** — families track enrollment, schedules, attendance, progress reports, and billing
- **Attendo** — coaches log daily attendance from their phones
- **Impulso** — coaches upload monthly progress reports; parents read them
- **PORTESCOpay** — internal billing and payments tracking

## Why this exists

PORTESCO already runs the operation. Parent communication is the #1 pain point — today it lives across WhatsApp, Google Sheets, and email. This platform digitizes the parts of the business that don't scale past where we are now.

## Stack

Frontend: Next.js 16 (App Router), TypeScript, Tailwind CSS
Backend: Supabase (PostgreSQL with Row-Level Security, Auth, Storage)
Hosting: Vercel
PWA: Mobile-first, installable

## Roadmap

- [x] Schema design (12 tables, RLS policies)
- [x] PRD and user flows
- [ ] Sprint 1 — Auth + Parent dashboard
- [ ] Sprint 2 — Coach progress reports (Impulso)
- [ ] Sprint 3 — Attendance (Attendo)
- [ ] Sprint 4 — Billing module (PORTESCOpay)
- [ ] Beta with 2 pilot schools

## Status

In early development. Schema and PRD complete. Currently building authentication and parent dashboard.

---

Learn more about PORTESCO: [robertoporteous.github.io/Portescosports](https://robertoporteous.github.io/Portescosports/)
