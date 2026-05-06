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
| Supabase client packages in `package.json` | Not yet                                        |
| SQL migrations + RLS                       | Not yet — design lives in PRD / planned schema |
| Magic link auth                            | UI + API stub; not calling Supabase Auth       |
| Role-based route protection                | Documented; permissive in code                 |
| Parent / staff / admin screens             | Mostly placeholders until data layer exists    |
| PWA icons / service worker                 | Incomplete                                     |


## Where to focus next (order)

1. Supabase project + migrations + RLS aligned with PRD.
2. Auth (magic link) + session + middleware.
3. One vertical slice: e.g. parent sees real child + activities (read-only).
4. Staff attendance → then monthly reports → billing last.

## Note on naming

If you previously used `product_vision.md` for this kind of content, rename or
replace it with this file so **“vision”** stays short (README + PRD) and
**“status”** stays honest and technical.