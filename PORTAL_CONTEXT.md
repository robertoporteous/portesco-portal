# PORTAL_CONTEXT.md — fuente única de verdad del PORTESCO Portal

> **Léelo primero, siempre.** Cualquier agente (Portal Agent en Cowork, Claude Code, Codex, Cursor) arranca aquí. Después va a `AGENTS.md` (reglas de código) y al brief del sprint. Este archivo reemplaza el "lee 5 archivos antes de cada brief" de los skills v2.0.
> **Actualízalo al cerrar cada sesión** (sección 9). Si lo que dice aquí y lo que dice otro doc se contradicen, gana este archivo y se corrige el otro.
> Última actualización: 28 sep 2026 · Roberto + Portal Agent

---

## 1 · Qué es el Portal (en una línea) y el producto final

**Un solo Portal con cuatro surfaces sobre la misma base de datos: la coordinadora opera, el profesor observa por voz, el padre ve un reporte curado y la vida del colegio, el admin ve el negocio. El niño es el sujeto, no un usuario.**

| Usuario (`users.role`) | Quién | Producto final | Estado 28 sep 2026 |
|---|---|---|---|
| **Coordinadora** (`coordinator`) | Kassandra, Verónica, Melany, Sara, Freddy | Coordinator Pad: clases de hoy, asistencia por toque, eventualidades, cerrar clase/día · cola de voice notes · aprobar reporte bi-semanal · alertas at-risk · drafts a padres · resumen del día | Asistencia + eventualidades + cierre **en piloto CIDMI**. Cola / alertas / reportes: secciones vacías |
| **Profesor** (`professor`) | Alexander, Jeremy, Andrés, Saul/Abraham | Mis clases hoy + roster · graba voz/texto post-clase · confirma menciones. **No** toma asistencia, **no** aprueba reportes | Construido end-to-end, **parqueado** (`GATE(voice-launch)`) |
| **Padre** (`parent`) | Familias | Dos ejes: **(a) mi hijo** — asistencia, avance, reporte bi-semanal curado · **(b) mi colegio** — calendario de prácticas y ligas, feed del colegio, todas las actividades, pago, tienda (link) | Solo dashboard hijos + actividades. Avance / Calendario / Noticias / Perfil = stubs. **Sprint 4 los construye** |
| **Admin** (`is_admin` / `admin`) | Roberto, Ale; Ana (Finanzas) | Manager Brain: enrollment por colegio, retention, alertas, Decision Memory · CRUD colegios/estudiantes/staff/eventos/noticias · PortescoPay · export para Ana | 9 stubs |
| **Estudiante** | ~354 baseline, 162 en CIDMI | **No es usuario.** Sujeto del Student Profile (expediente longitudinal) que leen padre (curado), coordinadora y admin | Tablas + trigger; nadie lo lee |

**Decisión (28 sep 2026):** el estudiante no tiene cuenta. Si un colegio lo pide, es un rol nuevo `student` con lectura del snapshot curado — nunca fusión con el padre. Razones: K-12 con menores, COPPA/consent, quien paga y decide es el padre.

## 2 · Vocabulario (usar uno solo)

- **Portal** = la aplicación completa (`portesco-portal`, `app.portescosports.com`).
- **Coordinator Pad** = surface `(staff)/coordinator-pad`. **Professor surface** = `(staff)/professor`. **Concierge** = lado padre `(parent)`. **Manager Brain** = `(admin)`. **Student Profile** = capa de datos.
- "Parent Portal", "Attendo", "Impulso", "PortescoPay" son **nombres v1 (abril 2026)**. `PORTESCO_Parent_Portal_PRD.md` es el PRD v1, reemplazado por el Plan v2.0. Sigue siendo la mejor descripción de las pantallas del padre y del admin; no de la arquitectura ni del flujo del profesor.

## 3 · Estado real del código (28 sep 2026)

72 commits · migraciones 0001-0009 aplicadas en prod · 18 tablas · 120 tests · live en Vercel con dominio.

| Live y en uso | Construido, parqueado | Stub |
|---|---|---|
| Login magic link · `proxy.ts` por rol · parent `/` (hijos + actividades) · Coordinator Pad completo (HOY, vista de clase, asistencia, eventualidades, cerrar/reabrir clase, cerrar día) · `/api/health` | Professor surface + grabador + pipeline voz (`lib/ai/*`: redact, whisper, claude, pipeline, confirm) · trigger `internal_alerts` · trigger perfil | `/progress` `/calendar` `/news` `/profile` (padre) · `/staff/*` · `/admin/*` (9) · `/api/cron` `/api/webhook` |

Tablas sin UI: `feedback_events`, `internal_alerts` (el trigger sí escribe), `bi_weekly_reports`, `wa_inbox`, `student_profiles` / `profile_observations` (sin lectura).
No existe: `regions`, columnas bilingües (salvo las que agregue 0010), `events`, `news_items`, `consent_records`, `parent_child_relationships`.

## 4 · Sprint actual: **Sprint 4 — Preview Tech Week (11 oct 2026)**

**Objetivo:** el 9 oct hay un Portal demostrable en el iPhone de Roberto, con un colegio ficticio, donde se recorre padre → coordinadora → profesor (voz) → admin en 5 minutos.

**Regla central:** el preview vive en **`portesco-dev`** (proyecto Supabase aparte) + rama **`demo`** en Vercel. **No toca prod, no toca a los 162 niños de CIDMI, no toca el Pad que usa Kassandra.** Los tests corren contra dev.

| SÍ (en orden) | NO (hasta después del 11 oct) |
|---|---|
| T0 `portesco-dev` + migraciones + seed demo + rama `demo` · T1 migración 0010 (`events`, `news_items`, policies de padre) · T2 asistencia del hijo + horario de prácticas · T3 calendario (eventos + prácticas) · T4 feed del colegio · T5 pago + perfil + PWA install · T6 admin overview mínimo (stretch) · T7 datos de demo pulidos + smoke iPhone + Loom | Recordatorios push · tienda (solo link) · PortescoPay · admin CRUD del feed · cambios a voz o al Pad · multi-region · i18n · invitar padres reales · macro agent completo · Mac mini |

Brief completo: `Proyecto - TechLab/03-herramientas/Portal/sprints/sprint-4-preview-techweek-claude-code-prompt.md`.

**Después del 11 oct:** se agrega la info real (eventos y noticias de CIDMI desde Supabase Studio o admin UI), se invita a padres de CIDMI cuando el piloto de Kassandra cierre (día 14 = 23 oct), y ahí se decide Sprint 5.

## 5 · Piloto CIDMI (28 sep – 23 oct 2026) — corre en paralelo, no se toca

- Kassandra pasa asistencia SOLO en el Pad. Hipótesis única: una coordinadora real lo usa sin que Roberto la empuje.
- Roberto **no pregunta hasta el día 7** (5 oct). Día 14 (23 oct): decisión seguir / ajustar / parar con las 5 métricas del PRD Sprint 3 §6.
- Adopción se mide con `class_attendance` (filas marcadas por ella) y `class_sessions.closed_at`. **No con logins** (`last_sign_in_at` subcuenta).
- Nadie prueba con sesiones de usuarios reales. Solo admin o `__rlstest_*` (AGENTS §9).

## 6 · Gates y deudas (detalle en `AGENTS.md` §12)

- `GATE(voice-launch)`: code review adversarial (RLS + redaction + ownership) **antes** de que un profesor real grabe. La demo con niños ficticios no lo activa.
- Parent visibility (`sprint-2-architecture.md` §16.2): un padre **nunca** lee `profile_observations` directo. Opción A (tabla snapshot curada) decidida; se construye con el reporte bi-semanal.
- Tests RLS contra prod: **prohibido desde el 24 sep** (162 menores reales). Solo contra `portesco-dev`.
- Pre-launch cleanup de voz: filas `pending_*` + audios huérfanos en `voice-obs`.
- `DEBT(attendance)`: `markAttendance` no chequea `closed_at` server-side. Pagar en Sprint 5.

## 7 · Decisiones tomadas (con fecha)

| Fecha | Decisión |
|---|---|
| 7-9 may 2026 | Plan v2.0: 4 productos, stack cerrado (Next 16 + Supabase + Vercel + Claude + Whisper), arquitectura LATAM+USA+EU, ejecución en cascada |
| 25 may 2026 | Lesiones/urgencias NO van por plataforma. Profesor no toma asistencia ni aprueba sus reportes |
| 8 jun 2026 | Carve-out Whisper: el audio no se redacta; todo texto a Claude sí |
| 6 jul 2026 | Flujo A: las menciones entran al perfil solo al confirmar el profesor |
| 8 sep 2026 | Voz parqueada con gate. Sprint 3 = piloto solo asistencia |
| 24 sep 2026 | DIA_1 = 28 sep. Nadie prueba con usuarios reales |
| 25 sep 2026 | Estudiante = sujeto, no usuario. Multi-region diferido al primer contrato fuera de Panamá. `portesco-dev` obligatorio antes de otro `npm test` |
| 28 sep 2026 | Sprint 4 = preview para Tech Week en `portesco-dev` + rama `demo`. Lado padre = dos ejes (mi hijo / mi colegio). Este archivo es la fuente de verdad; vive en la raíz del repo |

## 8 · Preguntas abiertas

1. ¿Qué reemplaza a "YC Summer 2026" como marco estratégico? (AGENTS §1 y Plan v2.0 lo tienen de norte y venció.)
2. ¿Ana entra al Portal o solo recibe CSV? Define si el export es endpoint admin o pantalla.
3. ¿La carpeta `Proyecto - TechLab` se mueve al repo (`docs/techlab/`) o a un repo privado? Hoy no está en git.
4. ¿Alexander sigue como profesor piloto de voz cuando abra Bloque 4?
5. ¿Cuántas horas/día tiene Roberto del 29 sep al 9 oct? (Define si T6 entra.)

## 9 · Mapa de documentos — cuál manda para qué

| Para saber… | Leer | Estado |
|---|---|---|
| Estado, sprint, decisiones, vocabulario | **este archivo** | vivo |
| Reglas de código, schema v2.0, errores recurrentes, deudas | `portesco-portal/AGENTS.md` §3, §4, §9, §12 | vivo (§1, §2, §8, §10 desactualizados — corregir post-11 oct) |
| Auditoría técnica por sprint | `portesco-portal/docs/IMPLEMENTATION_STATUS.md` | vivo |
| Resumen legible por sprint | `portesco-portal/CHANGELOG.md` | vivo |
| Pantallas del padre y del admin (diseño) | `PORTESCO_Parent_Portal_PRD.md` Módulos A y C | v1, reemplazado en arquitectura |
| Estrategia y 4 productos | `Proyecto - TechLab/tech-lab-vision-ai-native.md` | v2.0 mayo; marco YC vencido |
| Coordinator Pad + voz, decisiones de producto | `sprints/sprint-2-coordinator-pad-PRD.md` v4 | vigente |
| Deudas de arquitectura Sprint 3+ (bilingüe, parent visibility, compliance) | `sprint-2-architecture.md` §16 | vigente; numeración de migraciones vieja (próxima libre = **0010**) |
| Piloto CIDMI | `sprints/sprint-3-piloto-cidmi-PRD.md` | vigente |
| Análisis funcional completo | `03-herramientas/Portal/analisis-funcional-portal-2026-09-25.md` | 25 sep |
| Skills de agentes (PM, Tech Architect, Build Coach) | `02-skills/*.md` | v2.0; absorbidos por el skill **Portal Agent** |
| `README.md` del repo | — | **desactualizado** (dice Sprint 1 cerrado). No usar como fuente |

## 10 · Log de actualizaciones

- 28 sep 2026 — creado. Sprint 4 definido. Decisiones del 25 y 28 sep registradas.
