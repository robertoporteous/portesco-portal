<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# PORTESCO Portal — AI Agent Instructions

> Single source of truth for any AI coding agent (Claude Code, Codex, Cursor) working on this repo.
> Bilingual by design: English for technical contracts, Spanish for context, examples, and recurring errors written by Roberto.
> Last updated: 9 May 2026 — aligned with Tech Lab Vision v2.0.
> Auto-loaded by Claude Code at session start. If you are reading this in a fresh session, this is your starting context.

---

## 1 · What this product is

PORTESCO Portal is the **AI-native operating system for after-school and sports programs in K-12 schools**. PORTESCO Sports (Panama, 11 schools, ~354 students baseline March 2026, target 1,300+ in 2026) is customer 0 and runs on the Portal in production.

The Portal is **one application with four product surfaces**, all on the same database, auth, and infra:

| Producto | Quién lo usa | Estado |
|---|---|---|
| **Coordinator Pad** | Verónica, Bruno, Kassandra, Sara, Melany, Freddy (staff) | Sprint 2 anchor |
| **Concierge Agent** | Padres y estudiantes | Sprint 2 satellite (Voice→Progress Report) + roadmap Q3-Q4 |
| **Manager Brain** | Roberto, Ale, Ana (executives) | Q3-Q4 2026 |
| **Student Profile** | Longitudinal data layer (read by all) | Q4 2026 — schema vacía en migration 0005 |

Strategy: applying to YC Summer 2026. Mapping to RFS #2 (AI-Native Service Companies, primary), #4 (Company Brain), #15 (AI OS for Companies). Architecture is built for LATAM + USA + Europa from day 1; commercial execution is cascade (LATAM 0-3 months, USA 6-12, Europe 18-24).

**For full strategy:** read `tech-lab-vision-ai-native.md` at `/Users/robertoporteous/Desktop/Portesco AI/Proyecto - TechLab/tech-lab-vision-ai-native.md`.

---

## 2 · Stack (decided, not up for debate)

| Layer | Tech | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | Breaking changes from training data — read `node_modules/next/dist/docs/` first |
| Language | TypeScript 5 (strict mode) | |
| UI | React 19 + Tailwind 4 + shadcn/ui | |
| Backend | **Supabase** (Postgres + Auth + Storage + Realtime) | Project live, migrations 0001-0003 applied |
| Auth | Supabase Auth — magic link only | Padres no manejan passwords |
| Hosting | Vercel | Auto-deploy from GitHub `main` |
| Domain | `app.portescosports.com` | DNS configurable in Vercel |
| AI | `@anthropic-ai/sdk` (Claude) + `openai` (Whisper) | NOT installed yet — install in Sprint 2 only |
| Validation | `zod` | All inputs and DB writes |

**Migrations applied:** 0001, 0002, 0003, 0004 (foundation: 7 tables, RLS deny-all, 24 SELECT policies, helper `is_admin()` + 9 SECURITY DEFINER helpers, seed data CIDMI; 0004 fixes RLS recursion).
**Coming:** 0005 (Sprint 1.5 — multi-region + bilingual + multi-currency), 0006 (Sprint 2 — class_observations, audit_logs, student_profiles).

---

## 3 · Plan v2.0 schema rules (load these into context before any migration)

These rules are non-negotiable and apply to every new table and every write path.

### 3.1 Multi-region compliance (migration 0004)

```sql
-- Tabla regions: una fila por región operativa
regions(
  id uuid pk,
  code text unique,             -- 'LATAM_PA', 'USA_FL', 'EU_ES'
  name text,
  data_residency_zone text,     -- 'us-east', 'eu-west', 'sa-east'
  gdpr_required boolean,
  ferpa_required boolean,
  coppa_required boolean,
  default_language text,        -- 'es', 'en'
  default_currency text         -- 'USD', 'EUR'
)
```

- `schools.region_id` FK obligatorio.
- Every query that touches PII validates `region_id` first and applies the right compliance rules.
- Data residency zone determines Supabase project (post-Sprint 2 when we go multi-project).

### 3.2 Bilingual schema (migration 0004)

Every table that stores user-facing text uses these columns:

```sql
original_lang text,             -- 'es', 'en' — language as written by author
display_lang text,              -- language to render (per recipient preference)
translated_text text,           -- AI translation if needed
translation_confidence float    -- 0..1 from translation model
```

Applies to: `messages`, `class_observations`, `progress_reports`, `news_items`, `events.description`. Diferenciador real para LATAM+USA+Europa.

### 3.3 Audit logs (migration 0005, lección AllHere)

Every LLM call logs:

```sql
audit_logs(
  id uuid pk,
  ts timestamptz,
  user_id uuid,
  feature text,                 -- 'draft_response', 'progress_report', etc.
  input_raw text,               -- antes de redaction
  input_redacted text,          -- post PII redaction (lo que va al LLM)
  ai_output text,
  human_edit text,              -- versión final si humano editó
  human_decision text,          -- 'approved', 'edited', 'rejected', 'escalated'
  data_classification text,     -- 'pii', 'sensitive', 'general'
  region_id uuid fk,
  edit_distance integer,
  time_to_approve_seconds integer
)
```

If you write a code path that calls Claude or Whisper without writing to `audit_logs`, **stop and ask Roberto**. No exceptions.

### 3.4 PII redaction (Sprint 2 ajuste 4)

Before any prompt to Claude/Whisper, redact: full names of minors, parent emails, parent phones, exact addresses, school IDs that map to a single school. Replace with placeholders `[STUDENT_1]`, `[PARENT_EMAIL]`, etc. Keep mapping in memory, restore in output. Never log raw PII.

### 3.5 Telemetry on AI drafts (Sprint 2 ajuste 2)

Every AI-generated draft logs: `original_message`, `ai_draft`, `edited_version`, `edit_distance`, `time_to_approve`. Esto es la materia prima del flywheel. Stored in `audit_logs` with `feature='draft_response'`.

### 3.6 Thumbs feedback (Sprint 2 ajuste 3)

Every AI output has a `<ThumbsFeedback>` component near it. One click = INSERT into `feedback_events(user_id, feature, audit_log_id, rating, ts)`. No comment field. Fricción cero.

---

## 4 · Banned patterns

These will be rejected in code review without discussion.

- `console.log` con PII (nombres de estudiantes, emails, teléfonos, datos médicos).
- API keys hardcoded. Always via `process.env.*` and listed in `.env.example`.
- Cualquier query a una tabla con PII sin filtro `school_id` o `region_id`.
- Romper la estructura del Google Sheet de asistencia existente (legacy migration). Si tocás export, mantenés columnas exactas.
- `any` en TypeScript salvo en boundary code marcado con `// @ts-expect-error` y razón.
- Mocks en tests de integración. **Si no hay seed, no hay test.** Real desde día 1.
- Tocar migrations existentes (0001/0002/0003). Si necesitás cambiar schema, escribís migration nueva.
- Llamar al LLM sin escribir a `audit_logs`.
- Mensajes a padres con markdown. **Plain text siempre.** Si en algún momento se mandan vía Wati, sale del DB como string limpio.
- Confiar en datos del cliente (browser) para roles/auth. Siempre verificar server-side via Supabase session.

---

## 5 · Multi-tenant rules

| Rule | Cómo se enforza |
|---|---|
| Toda query filtra por `school_id` | RLS policy en Supabase, NO solo en código |
| Roles: `parent`, `coordinator`, `professor`, `admin` | Tabla `users.role`, middleware redirige según rol |
| `parent` solo ve sus `students` (FK `students.parent_id = auth.uid()`) | RLS policy |
| `coordinator` solo ve `schools` donde tiene assignment | RLS policy via tabla puente |
| `admin` ve global, pero loggeado en `audit_logs` | Application-layer + audit |

---

## 6 · Routing structure (existing, do not restructure)

```
app/
├── (parent)/        → Padre logueado
│   ├── page.tsx          → Dashboard: hijos + actividades
│   ├── calendar/         → Calendario
│   ├── progress/         → Progress reports (Concierge surface)
│   └── profile/
│
├── (staff)/         → Coordinador / profesor (Coordinator Pad surface)
│   ├── page.tsx          → Inbox del día
│   ├── attendance/       → Tomar lista (legacy Attendo)
│   ├── students/
│   └── reports/          → Subir observaciones de clase
│
├── (admin)/         → Admin / executive (Manager Brain surface)
│   ├── page.tsx          → Dashboard global
│   ├── schools/
│   ├── students/
│   ├── staff/
│   ├── reports/
│   └── settings/         → Eventualmente PortescoPay (Sprint 4+)
│
├── auth/
│   └── callback/route.ts
└── login/
    └── page.tsx
```

**Reglas:**
- Server Components by default. Client Components solo cuando necesitás state/interactivity.
- Cada surface group `(parent)`, `(staff)`, `(admin)` tiene su propio layout con su sidebar/nav.
- `middleware.ts` (o `proxy.ts` según versión Next 16) lee la sesión y redirige según `users.role`.

---

## 7 · Working style — cómo Roberto quiere trabajar con vos

Estas reglas son del brain file de Roberto (en su carpeta de Cowork Tech Lab). Respétalas todas.

- **Una pregunta a la vez** cuando necesités aclaración. No me dispares 5 questions juntas.
- **2-3 opciones con tradeoffs**, no recomendaciones únicas. Si das una sola respuesta sin alternativas, me siento empujado y pierdo criterio.
- **Velocity Ramp:** 70% funcional rápido > 100% perfecto tarde. Si algo opcional retrasa la slice end-to-end, sale.
- **Vertical slice antes que horizontal.** Una feature funcionando end-to-end > tres features a medias.
- **Real desde día 1.** No mocks. Si no hay datos, hay seed.
- **Commit por tarea cerrada.** Cada step de la lista termina con commit + mensaje descriptivo.
- **Paso a paso, no toda la solución de un golpe.** Si vas a generar 500 líneas, paramos y validamos cada bloque.
- **Pushback cuando sea necesario.** Si crees que estoy equivocado, dilo.
- **Sin relleno.** No "Excelente pregunta". Directo a la respuesta.
- **Español por defecto.** Inglés en código, en docs técnicos, en commits, en este AGENTS.md (con secciones en español como esta).

---

## 8 · Sprint context (current)

**Sprint 1 Bloque 1** — ✅ closed. Foundation DB (migrations 0001-0003, RLS, seed CIDMI).
**Sprint 1 Bloque 2** — ✅ closed (commit `857cdc5`). Magic link auth + parent vertical slice + Vercel deploy + RLS isolation verified. Migration 0004 (fix RLS recursion) aplicada.
**Sprint 2 Bloque 1** — ✅ closed (commit `bf3eaa7`, 4 jun 2026). Migrations 0005 (audit foundation + write-side RLS) + 0006 (observations/sessions/alerts + 8 enums + 5 helpers + consecutive_absence trigger) + 0007 v2 (profile_observations NORMALIZADA + bi_weekly_reports + wa_inbox + Triple Check fix) + 0008 (fix RLS gap class_observations write scope) + seed CIDMI pilot (36 students Fútbol U14-U18) + `lib/ai/redact.ts` con 20 tests + 6 tests RLS write-side. 26/26 green.
**Sprint 2 Bloque 2** — ⏳ next. Coordinator Pad UI dashboard + close-day + asistencia + vista sesión + script seed calendario sesiones. Sin AI todavía (eso es Bloque 3).
**Sprint 2 Bloques 3-5** — ⏳ pending. Voice pipeline (3), reportes bi-semanales + pg_cron (4), alerts UI + WhatsApp ingest + admin quality-review + tests E2E (5).
**Sprint 3** — ⏳ pending. Migración 0009: multi-region + bilingüe + multi-currency + parent visibility (architecture §16 deudas).

If a session is supposed to work on a specific sprint, Roberto will paste the corresponding `sprint-*.md` brief. **Read that brief in full before doing anything.**

---

## 9 · Recurring errors (live section — update after every session)

> Cada vez que cometés un error que ya cometiste antes, agregalo acá como regla.
> Formato: **Regla** — *Por qué (incidente)* — *Cómo aplicarlo*.
> Esto es lo que hace que Claude Code no repita el mismo error entre sesiones nuevas.

**RLS policies con cross-table reference necesitan SECURITY DEFINER function para evitar recursion.**
*Por qué:* 11 mayo 2026, una policy de `staff_activities` hacía SELECT contra `activities`, y la policy de `activities` hacía SELECT contra `staff_activities` → loop infinito detectado por Postgres. La query falló con `infinite recursion detected in policy for relation "staff_activities"`. Loops indirectos similares existían en `students ↔ enrollments` y `users ↔ staff_activities`. Fixed en migration 0004.
*Cómo aplicar:* cuando una policy `USING` / `WITH CHECK` necesita verificar pertenencia cross-table, NO usar `EXISTS` / `IN (SELECT ...)` directo contra otra tabla. Extraer la lógica a una function con `language sql security definer set search_path = public stable` que retorna `setof uuid`; usar `where id in (select my_function())` en la policy. Mismo patrón que `public.is_admin()` en `0002_rls.sql`. Siempre `revoke execute from public` + `grant execute to authenticated`.

**`LANGUAGE sql` functions resuelven identifiers en CREATE, no lazy. Crear tablas ANTES de los helpers que las referencian.**
*Por qué:* 3 junio 2026, migración 0006 v1 puso los 5 helpers SECURITY DEFINER (todos `language sql`) ANTES de las CREATE TABLE de `class_sessions` / `class_observations`. La asunción "Postgres resuelve cuerpos de función lazy" es **falsa para `language sql`** (sí aplica a `language plpgsql`). El parser SQL resuelve nombres en tiempo de `CREATE FUNCTION`, así que falló con `ERROR: 42P01: relation "public.class_sessions" does not exist`. El `BEGIN/COMMIT` wrapper hizo rollback total y ningún objeto del 0006 quedó persistido. Fixed en 0006 v2 reordenando: enums → tablas (sin policies) → helpers → policies → trigger → ALTER FK → verification.
*Cómo aplicar:* en cualquier migración que cree tablas Y helpers SECURITY DEFINER con `language sql` que las referencian: las CREATE TABLE deben ir ANTES que las CREATE FUNCTION. Si quieres mantener las policies cerca de su tabla por legibilidad, NO podés — agrupá las policies al final del archivo después de los helpers. `language plpgsql` (los triggers, ej. `trigger_consecutive_absence_alert`) sí resuelve lazy y puede ir en cualquier orden con respecto a las tablas que toca. La regla solo aplica a `language sql`.

**RLS `author/created_by = self` NO es suficiente cuando el author puede falsificar el `session_id` (o cualquier FK que apunta a una entidad scoped). SIEMPRE combinar con check de session ownership via helper.**
*Por qué:* 3 junio 2026, migración 0006 v2 implementó al pie de la letra el architecture v2 §2.3 con las policies `class_observations: author insert own` / `author update own` usando solo `with check (author_id = auth.uid())`. Detectado al escribir tests RLS Bloque 1: un coordinator de school A podía hacer `INSERT INTO class_observations (session_id, author_id, kind) VALUES (<session de school B>, <su uuid>, ...)` y la policy lo dejaba pasar — las RLS permissive policies se combinan OR (no AND), y las foreign keys NO validan RLS de la tabla referenciada. Fix en migración 0008: agregar `AND (session_id IN (select coordinator_session_ids()) OR session_id IN (select professor_session_ids()))` a `with check` y a `using`. Audit de class_attendance y class_eventualities: NO gap (su write side ya filtraba por coordinator_session_ids). Audit de mention_assignments: NO gap directo (filtra por author_observation_ids) pero propagaba el gap de class_observations indirectamente — fixear class_observations cortó la cadena.
*Cómo aplicar:* cualquier policy `INSERT` / `UPDATE` / `DELETE` cuya única defensa es `author_id = auth.uid()` (o `created_by = auth.uid()`, `marked_by = auth.uid()`, etc.) sobre una tabla con FK a una entidad scoped por escuela / actividad / sesión está mal por defecto. Combinar SIEMPRE con un check de ownership de la FK via helper SECURITY DEFINER (`coordinator_session_ids()`, `professor_session_ids()`, etc.). La server action es la segunda línea, no la primera. Defense in depth (AGENTS.md §3.4) requiere RLS como primera línea para data de menores.

**Tests RLS requieren cleanup riguroso con prefijo `__rlstest_*` + cleanup defensivo en `beforeAll` (try/catch) + `afterAll`.**
*Por qué:* mientras no exista `portesco-portal-test` (Sprint 3+ TBD), los tests RLS corren contra `portesco-portal-prod`. Si un run anterior falló y `afterAll` no corrió, queda estado sucio que rompe el siguiente run con duplicate-key o constraint violations. El defensivo de `beforeAll` (un `DELETE WHERE name/email LIKE '__rlstest_%'` envuelto en try/catch) permite re-correr sin manual cleanup.
*Cómo aplicar:* TODA fixture creada por tests (schools, activities, users, sessions, etc.) lleva prefijo `__rlstest_` en el campo identificador natural (name / email / slug). El `beforeAll` empieza con un DELETE defensivo de todas las filas prefijadas, wrapped en try/catch (sin throw). El `afterAll` repite el mismo cleanup. Si alguna fixture rompe la cadena de borrado por FK, agregar a `afterAll` un DELETE explícito en orden inverso de creación.

**Tests RLS usan test users dedicados `__rlstest_*@portesco-test.com`, NUNCA users reales (Kassandra, Alexander, Roberto). Protege métricas de adopción.**
*Por qué:* PRD v4 §6.6 mide "Kassandra abre Pad 5 días seguidos" via `users.last_signed_in_at` y signin counts. Si tests RLS autentican como Kassandra real cada vez que `npm test` corre (CI, pre-commit hook, local debug), inflan ese conteo artificialmente y la métrica de adopción se vuelve ruido. Mismo riesgo con cualquier query analítica futura que cuente uso por user real.
*Cómo aplicar:* el `beforeAll` de cualquier test que necesite autenticarse como coordinator/professor/parent/admin crea su propio set de auth users (`__rlstest_coord@portesco-test.com`, `__rlstest_prof@portesco-test.com`, etc.) via `auth.admin.createUser` con service_role, los enlaza a fixtures `__rlstest_*` también prefijadas, y los borra en `afterAll`. NUNCA `signInAsUser('kassandra@...')`. Si alguien escribe un test que llama a un user real, rebote en code review.

---

## 10 · References (read before deep work)

Files outside this repo (in Roberto's Cowork Tech Lab folder):

- `tech-lab-vision-ai-native.md` — full Plan v2.0 strategy
  Path: `/Users/robertoporteous/Desktop/Portesco AI/Proyecto - TechLab/tech-lab-vision-ai-native.md`
- `stack-decision.md` — full stack rationale
  Path: `/Users/robertoporteous/Desktop/Portesco AI/Proyecto - TechLab/03-herramientas/Portal/stack-decision.md`
- Current sprint prompt
  Path: `/Users/robertoporteous/Desktop/Portesco AI/Proyecto - TechLab/03-herramientas/Portal/sprints/sprint-1-bloque-2-claude-code-prompt.md`
- PORTESCO brain file (founder context: tono, restricciones, equipo)
  Path: `/Users/robertoporteous/Desktop/Portesco AI/Proyecto - TechLab/01-brain-file/PORTESCO_brain_file_v2 copy.md`

Files in this repo:

- `node_modules/next/dist/docs/` — Next.js 16 actual docs (NOT what's in your training)
- `README.md` — repo overview
- `docs/IMPLEMENTATION_STATUS.md` — current state
- `supabase/migrations/` — applied migrations 0001-0003

---

## 11 · When in doubt

1. Re-read this file.
2. Re-read the sprint brief.
3. Check `tech-lab-vision-ai-native.md` for strategic context.
4. Ask Roberto **one** clarifying question. Don't guess on architecture, schema, or anything that touches PII / auth / compliance.

*This file is alive. Edit it when something changes. Add to "Recurring errors" after every session.*
