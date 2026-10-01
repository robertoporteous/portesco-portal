# Changelog — PORTESCO Portal

Cambios por sprint/bloque, en orden inverso. Lo detallado de ingeniería vive en
`docs/IMPLEMENTATION_STATUS.md`; esto es el resumen legible.

---

## Sprint 4 — Preview Tech Week (lado padre v1) · 28–30 sep 2026 (en curso, demo 11 oct)

Primer sprint del **Concierge** (lado padre), construido en dos noches sobre un
colegio ficticio y desplegado en `app.portescosports.com`. Nada de esto toca el
Coordinator Pad ni a CIDMI. El piloto con Kassandra **no ha arrancado**.

### Añadido

- **Migración 0010**: tablas `events` y `news_items` (con columnas bilingües),
  helper `parent_child_school_ids()`, y 9 policies: el padre lee eventos y
  noticias publicados de las escuelas de sus hijos, las sesiones de las
  actividades de sus hijos, la asistencia **solo** de sus propios hijos y el
  catálogo activo de actividades de su colegio. Admin y coordinadora escriben.
- **Inicio del padre**: por hijo, "Asistencia de <mes>: X de Y" (clases cerradas
  vs presente/tarde) y "Próxima práctica".
- **Avance**: selector de hijo, barra de asistencia del mes por actividad y las
  últimas 10 clases con estado. Bloque honesto para el reporte quincenal
  (Bloque 4).
- **Calendario**: banner "Hoy", próximos 30 días mezclando eventos del colegio y
  prácticas de los hijos (colores por tipo), horario semanal.
- **Noticias**: feed del colegio con 5 tipos de card (resultado con marcador,
  anuncio, foto, promo, recordatorio de pago), link externo (tienda).
- **Perfil**: hijos con colegio y grado, sección Pago (Yappy + cuenta bancaria
  con botón copiar, "hasta el 10 de cada mes"), cerrar sesión.
- **Bottom nav** con links reales y estado activo; **PWA** instalable (manifest,
  iconos placeholder, modo standalone en iOS).
- **Admin overview**: colegios, estudiantes, asistencia 7 días, clases cerradas
  hoy, tabla por colegio. Solo conteos.
- **Acceso demo**: `supabase/scripts/demo-login-link.ts` genera un link de un
  solo uso para `demo-padre | padre2 | coord | prof`; `/auth/enter` muestra un
  botón para que la vista previa de WhatsApp no gaste el token; `/auth/callback`
  acepta `token_hash`.
- **Colegio Demo Portesco** (slug `demo`): 4 users, 4 estudiantes inventados, 6
  actividades, 66 sesiones, asistencia, 6 eventos, 6 noticias. Scripts
  `create-demo-users.ts`, `seed-demo-school.sql`, `seed-demo-feed.sql`,
  `cleanup-demo-school.sql`.

### Cambiado

- El profesor cae en `/professor` tras el login (antes: stub `/staff`).
- `lib/types.ts`: `Event`, `NewsItem`, `EventType`, `NewsKind`, `BilingualColumns`.
- Coordinator Pad: "N enrolled" → "N inscritos".

### Conocido

- Iconos de la PWA son placeholder (azul/rojo con "P"); falta el logo real.
- El link de acceso demo abierto desde el iPhone aún no se confirmó (30 sep).
- Guard de tests contra prod retirado hasta que exista `portesco-dev`.

### Decisiones técnicas tomadas

- Sin `portesco-dev` este sprint; el demo vive en un colegio ficticio del mismo
  proyecto para que ningún rol demo vea un nombre real.
- `demo` → `main` al cierre de cada tarea; el demo se muestra en el dominio real.
- `rel()` normaliza embeds to-one de Supabase (objeto vs array) — causa de un
  crash en las tres pantallas nuevas.

### Verificación

- 127/127 tests (7 nuevos de RLS del padre, con control positivo y
  "padre no puede escribir"). Las 5 pantallas del padre verificadas en Chrome
  como `demo-padre` contra datos reales del colegio demo.

### Próximos pasos

- T7: logo real, re-correr `seed-demo-school.sql` antes del 11 para que "hoy"
  tenga clases, smoke en iPhone, Loom de respaldo.

---

## Sprint 3 — Piloto CIDMI, solo asistencia · 24 sep 2026

Sprint sin producto nuevo: pone el Coordinator Pad de Sprint 2 Bloque 2 en manos
de Kassandra Dos Santos con la data real de CIDMI. **DIA_1 = lunes 28 sep 2026.**

### Data real en producción

- **162 estudiantes** de CIDMI (38 antes → +124 del roster 2026), con **172
  enrollments** en las 10 actividades activas.
- **13 actividades** creadas bajo el modelo *deporte × nivel* (Primaria /
  Secundaria). Las categorías U6…U18 no son actividades: se derivan de
  `students.grade`. `Fútbol U14-U18` de Sprint 2 se renombró a
  `Fútbol Secundaria` conservando su id, sus 36 enrollments y su asignación de
  profesor.
- **3 desactivadas** por no tener un solo niño inscrito (Basketball, Baile Urbano
  y Flag Football de Secundaria): en la planilla de asistencia esos grupos no
  tuvieron una sola marca en todo 2026. Se reactivan con el addendum del
  generador si la coordinadora confirma que existen.
- **72 sesiones de clase**: 18 bloques semanales × 4 semanas, del lunes 28 sep al
  viernes 23 oct, en hora de Panamá (UTC-5, sin DST).

### Generador de roster

`supabase/scripts/generate-cidmi-seed.ts` — lee el CSV del roster y emite el SQL
del seed más la lista de pendientes. Corre con `node` (Node 25 ejecuta TypeScript
nativo): sin dependencias nuevas en el stack.

- Reglas de inclusión y de nivel explícitas; lo que no resuelve **no se inserta**
  y va a la lista de pendientes con su motivo. Aborta sin escribir nada si más de
  5 filas caen ahí — señal de que el mapeo está mal, no de que falten datos.
- Deduplica contra los estudiantes existentes por nombre normalizado, con la
  misma tabla de caracteres en TypeScript y en SQL.
- Modo `--addendum` para agregar altas después del seed, sin reescribir nada.
- **PII:** el CSV del roster y el SQL generado viven en
  `supabase/scripts/private/`, en `.gitignore`. Se commitea el generador, nunca
  su salida. `outputs/` también quedó ignorado.

### Correcciones de producto que salieron del piloto

- **Categorías por pares de grados.** `lib/categories.ts` mapeaba 3 grados (los
  del piloto de Sprint 2); ahora mapea los 13 de CIDMI:
  Kinder+1ero+2do = U8 · 3ero+4to = U10 · 5to+6to = U12 · 7mo+8vo = U14 ·
  9no+10mo = U16 · 11vo+12vo = U18. Sin esto, una clase de 33 chicos aparecía
  como un único bloque "Otros".
- **El coordinator aterriza en su propio surface.** Post-login y al entrar a
  `/staff`, un coordinator va a `/coordinator-pad` en vez del stub "Panel del
  Profesor — Próximamente" de Sprint 1.
- **`GATE(voice-launch)` cerrado más fuerte.** El surface `/professor` dejaba
  entrar al coordinator; ahora es professor + admin solamente. El piloto da
  acceso real a una coordinadora y la voz sigue parqueada hasta el code review
  adversarial. Se revierte con la COLA de Bloque 4, después de ese review.

### Verificación

- **120/120 tests** en verde, dos corridas seguidas.
- Test nuevo de aislamiento RLS de la data del piloto: un coordinator de otra
  escuela no ve actividades, sesiones ni estudiantes de CIDMI; un padre ve sólo a
  su hijo. Incluye un control positivo, sin el cual los casos negativos pasarían
  igual con un cliente roto.
- Smoke manual en producción sobre las 6 clases de un día real: asistencia,
  eventualidad, cerrar / reabrir / cerrar clase, cerrar día. La data de prueba se
  borró después; el piloto arranca en cero.

### No entra en este sprint

Export CSV para Finanzas (Sprint 4 si el piloto sobrevive), UI de administración
de recurrencia, lado padre, Bloque 4 (ThumbsFeedback, COLA, realtime), y
cualquier cambio de UI al Pad más allá de los redirects de arriba. Las mejoras
cosméticas se anotan y se evalúan el día 14.
