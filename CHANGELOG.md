# Changelog — PORTESCO Portal

Cambios por sprint/bloque, en orden inverso. Lo detallado de ingeniería vive en
`docs/IMPLEMENTATION_STATUS.md`; esto es el resumen legible.

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
