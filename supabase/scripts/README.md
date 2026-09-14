# supabase/scripts

Scripts de seed y mantenimiento de datos. **Ninguno corre solo**: se pegan a mano
en el SQL Editor de Supabase Studio, que corre con `service_role` y bypassea RLS.

## Regla de PII

`supabase/scripts/private/` está en `.gitignore` y **nunca** entra a git. Ahí viven
el roster con nombres de menores y el SQL generado a partir de él. Lo que se
commitea es el **generador** y este README, nunca su salida.

Antes de agregar cualquier archivo con nombres reales de niños, verificá:

```bash
git check-ignore -v supabase/scripts/private/<archivo>
git status --short --untracked-files=all | grep private   # debe salir vacío
```

## Orden de ejecución (Sprint 3, piloto CIDMI)

| # | Script | Qué hace |
|---|---|---|
| 1 | `cleanup-cidmi-pre-pilot.sql` | Borra data de prueba pre-piloto. Ya corrido (commit `4f581c8`). |
| 2 | `seed-activities-sprint-3.sql` | Las 13 actividades reales (12 INSERT + rename de `Fútbol U14-U18` → `Fútbol Secundaria`). Commit `7acdd0d`. |
| 3 | `generate-cidmi-seed.ts` → `private/seed-cidmi-pilot-sprint-3.sql` | Roster: students + enrollments. Desactiva las actividades que quedan sin un solo niño. |
| 4 | `generate-class-sessions-sprint-3.sql` | Sesiones de las 4 semanas del piloto. |

Cada uno es idempotente: re-correrlo no duplica nada.

## Generador del roster

```bash
node supabase/scripts/generate-cidmi-seed.ts
```

Node 25 ejecuta TypeScript nativo (type stripping) — no hace falta `tsx` ni
`ts-node`, y no se agrega ninguna dependencia al stack.

**Lee:**
- `private/cidmi-roster-2026.csv` — export de la pestaña `Base CIDMI` del Sheet
  "BASE DE DATOS DE ESTUDIANTES — CIDMI 2026". 11 columnas, UTF-8.
- `.env.local` — consulta prod **en solo lectura** (students y enrollments que ya
  existen) para deduplicar y para calcular los conteos esperados. No escribe nada
  en la DB.

**Escribe:**
- `private/seed-cidmi-pilot-sprint-3.sql` — el seed, para pegar en Studio.
- `private/pendientes-kassandra.md` — lo que no resolvió y lo que hay que
  confirmar con Kassandra.

Imprime un resumen en stdout: filas incluidas, students nuevos vs. ya existentes,
enrollments por actividad, y marca las que quedan sin un solo niño.

Si más de 5 filas caen en la regla (d) el generador **aborta sin escribir nada**:
es señal de que el mapeo está mal, no de que falten datos.

### Agregar niños después del seed (addendum)

Cuando Kassandra revise la lista por actividad y falte gente, no se toca el seed:

```bash
cat > supabase/scripts/private/delta.json <<'EOF'
[
  { "fullName": "Nombre Apellido", "grade": "8vo", "activities": ["Voleibol Secundaria"] }
]
EOF

node supabase/scripts/generate-cidmi-seed.ts --addendum private/delta.json
# → private/seed-cidmi-addendum.sql, revisar y correr en Studio
```

Valida los nombres de actividad contra las 13 del catálogo, **reactiva** la
actividad si había quedado desactivada por vacía, y usa los mismos guards que el
seed grande, así que se puede correr las veces que haga falta.

## Por qué los guards son `WHERE NOT EXISTS` y no `ON CONFLICT`

`activities` no tiene `unique (school_id, name)` y el índice
`(activity_id, scheduled_start_at)` de `class_sessions` tampoco es único, así que
no hay constraint sobre la cual hacer `ON CONFLICT`. `enrollments` sí tiene
`unique (student_id, activity_id)`; ahí el `NOT EXISTS` es redundante pero se
mantiene por consistencia.

El dedupe de `students` es por nombre **normalizado** (minúsculas, sin acentos,
espacios colapsados) con `translate()`, no con la extensión `unaccent` — no está
instalada en el proyecto. La normalización de TypeScript y la de SQL usan la misma
tabla de caracteres a propósito: si divergen, el guard falla y se duplican niños.
