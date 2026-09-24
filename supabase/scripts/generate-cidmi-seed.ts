/**
 * supabase/scripts/generate-cidmi-seed.ts
 * Sprint 3 — Piloto CIDMI (solo asistencia). TAREA 4: generador del seed de roster.
 *
 * QUÉ HACE
 *   Lee   supabase/scripts/private/cidmi-roster-2026.csv   (PII, NO commiteado)
 *   Escribe
 *     supabase/scripts/private/seed-cidmi-pilot-sprint-3.sql   (PII, NO commiteado)
 *     supabase/scripts/private/pendientes-kassandra.md         (PII, NO commiteado)
 *
 *   ESTE archivo sí se commitea: es el generador, no su salida. Nunca escribas
 *   un nombre real de niño acá adentro salvo los overrides explícitos de abajo,
 *   que son decisiones de Roberto documentadas (§ OVERRIDES).
 *
 * CÓMO SE CORRE
 *   node supabase/scripts/generate-cidmi-seed.ts
 *   node supabase/scripts/generate-cidmi-seed.ts --addendum private/delta.json
 *
 *   Node 25 ejecuta TypeScript nativo (type stripping). No hace falta tsx/ts-node
 *   ni agregar una dependencia al stack.
 *
 *   Lee .env.local para consultar prod EN SOLO LECTURA (students existentes, para
 *   el dedupe y el reporte). No escribe nada en la DB: la escritura es el .sql,
 *   que Roberto revisa y corre a mano en el SQL Editor de Supabase Studio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLA DE INCLUSIÓN
 *   Una fila entra si `Actividad(es)` NO está vacía Y `Estatus` NO contiene
 *   "NO CONTINUARÁ". Todo lo demás queda afuera (incluye "Solo en formulario",
 *   que no trae actividad).
 *
 * REGLA DE NIVEL (actividad = deporte × nivel)
 *   a) Categoría explícita manda, aunque el grado diga otra cosa:
 *        Fútbol   U6/U8/U10/U12 → Primaria   · U14/U16/U18 → Secundaria
 *        Voleibol U10/U12       → Primaria   · U15/U18     → Secundaria
 *   b) Sin categoría, con grado: Kinder/1ero–6to → Primaria · 7mo–12vo → Secundaria
 *   c) Sin categoría y sin grado: ver SIN_GRADO_* abajo (whitelist de Roberto,
 *      verificada contra la planilla).
 *   d) Lo que no resuelva a/b/c NO se inserta: va a pendientes-kassandra.md con
 *      nombre + actividad + motivo.
 *
 * REGLA DE NOMBRE CUANDO CSV Y PROD DIFIEREN  (decisión Roberto, 13 sep 2026)
 *   Gana la fuente "formulario" (la llenó el padre) si el CSV la trae en la
 *   columna `Fuente`. Si no, gana la versión que no tiene un typo evidente.
 *   Cada caso resuelto queda listado en OVERRIDES con su razón — no se infiere
 *   nada en runtime: si aparece un par de nombres parecidos que no está en
 *   OVERRIDES, el generador lo reporta y NO lo fusiona solo.
 *
 * MULTI-ACTIVIDAD
 *   "Ajedrez, Baloncesto, Fútbol U8" → 3 enrollments.
 *   "Fútbol U12, Fútbol U14" → 2 enrollments (Primaria y Secundaria): correcto,
 *   no es un error.
 *   "Fútbol U16, Fútbol U18" → 1 enrollment: las dos categorías caen en la misma
 *   actividad (Secundaria), así que se deduplica.
 *   Sinónimo: Baloncesto = Basketball.
 *
 * PII
 *   Al `students` sólo van full_name, grade, school_id y parent_id (Roberto como
 *   placeholder, mismo patrón que Sprint 2 — el lado padre no entra en este
 *   piloto). Correo y teléfono del acudiente NO se cargan: se quedan en el CSV.
 *   Si algún día hay que persistirlos, van a `_pilot_parent_contacts`, nunca a
 *   otra tabla.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const ROSTER_CSV = join(REPO, 'supabase/scripts/private/cidmi-roster-2026.csv');
const OUT_SQL = join(REPO, 'supabase/scripts/private/seed-cidmi-pilot-sprint-3.sql');
const OUT_PENDIENTES = join(REPO, 'supabase/scripts/private/pendientes-kassandra.md');

const SCHOOL_SLUG = 'cidmi';
const PARENT_EMAIL = 'roberto.porteous.bim@gmail.com';

/** Si la regla (d) manda más de esto a pendientes, algo está mal en el mapeo. */
const MAX_PENDIENTES = 5;

/**
 * `students.grade` es `text NOT NULL` (0001) — sin CHECK ni enum, así que acepta
 * cualquier texto. ~40 niños del CSV no traen grado, y NO se inventa uno a partir
 * del nivel ni de la categoría (decisión Roberto, 13 sep 2026): va este literal.
 *
 * Es seguro en la UI: `categoryForGrade()` (lib/categories.ts) es un lookup con
 * fallback `|| "Otros"`, y "Otros" está en CATEGORY_ORDER — el niño se agrupa en
 * "Otros" y se renderiza normal, no tira excepción ni queda undefined.
 *
 * El UPDATE de grade del seed trata este valor igual que NULL, así que el
 * addendum puede corregirlo cuando Kassandra complete los grados.
 */
const SIN_GRADO = 'Sin grado';

/**
 * DIA_1 del piloto, para el encabezado de pendientes-kassandra.md.
 *
 * Movido del lunes 21 al lunes 28 de septiembre de 2026 (reset-dia1-sprint-3.sql,
 * 24 sep 2026): las sesiones se habían generado con DIA_1 = 21 sep, pero el
 * piloto no arrancó — Kassandra nunca entró y esa semana pasó sin una sola marca
 * de asistencia. Si cambia de nuevo, se cambia acá y en
 * generate-class-sessions-sprint-3.sql (CTE `params`).
 */
const DIA_1_LABEL = 'lunes 28 de septiembre de 2026';
const VENTANA_LABEL = '28 sep - 23 oct 2026 (4 semanas, última clase viernes 23 oct)';

// ═════════════════════════════════════════════════════════════════════════════
// OVERRIDES — decisiones de Roberto, 13 sep 2026. No inferir, no ampliar.
// ═════════════════════════════════════════════════════════════════════════════

type Override = {
  csvName: string;
  canonical: string;
  renameProdFrom?: string;
  forceGrade?: string;
  reason: string;
};

const OVERRIDES: Override[] = [
  {
    csvName: 'Sebastin Saavedra',
    canonical: 'Sebastian Saavedra',
    reason:
      'Mismo niño. Typo en el CSV (falta la "a"). Gana prod: el CSV no lo trae por formulario.',
  },
  {
    csvName: 'Gianluca Bravo',
    canonical: 'Gianluca Bravo',
    renameProdFrom: 'Gialuca Bravo',
    forceGrade: '7mo',
    reason:
      'Mismo niño. Typo en prod (falta la "n") → se renombra prod. Grado: se conserva 7mo de prod; ' +
      'el CSV dice 10mo y un chico de 10mo en U14 es raro. A confirmar con Kassandra.',
  },
  {
    csvName: 'Mathias Galavis',
    canonical: 'Mathias Galavis',
    renameProdFrom: 'Matias Galaviz',
    reason:
      'Mismo niño (la base lo marca como fusión). Gana el CSV: viene del formulario que llenó el padre.',
  },
];

/** Students de prod que NO están en el CSV y se dejan intactos a propósito. */
const PROD_KEEP_AS_IS: { name: string; note: string }[] = [
  {
    name: 'Sergio Salomon',
    note:
      'No está en el CSV y no fusiona con nadie (los candidatos Sergio Solorzano y Salomón Mendoza ' +
      'entran como students nuevos). Se deja con su enrollment en Fútbol Secundaria. ' +
      'Un fantasma en la lista por unos días es más barato que borrar un niño real.',
  },
];

// Regla (c): sin categoría y sin grado.
const SIN_GRADO_SIEMPRE_PRIMARIA = ['Porrismo', 'Flag Football'];
const SIN_GRADO_WHITELIST: Record<string, string[]> = {
  'Baile Urbano': ['Amelie Best', 'Sol Acuña', 'Sophie Bernal', 'Isabella Samudio'],
  Ajedrez: ['Kaiden Katsoudas'],
};

/**
 * `Porrismo Secundaria` NO existe como actividad (sin inscritas al crear el
 * horario). Si la regla (b) manda un caso de Porrismo a Secundaria, se fuerza a
 * Primaria y se reporta, en vez de dejar al niño fuera de toda lista.
 */
const SPORTS_SOLO_PRIMARIA = ['Porrismo'];

// ═════════════════════════════════════════════════════════════════════════════
// Catálogo de actividades (las 13 de la Tarea 3, commit 7acdd0d)
// ═════════════════════════════════════════════════════════════════════════════

type Level = 'Primaria' | 'Secundaria';

const ACTIVITIES: string[] = [
  'Fútbol Primaria', 'Voleibol Primaria', 'Basketball Primaria', 'Baile Urbano Primaria',
  'Flag Football Primaria', 'Porrismo Primaria', 'Ajedrez Primaria',
  'Fútbol Secundaria', 'Voleibol Secundaria', 'Basketball Secundaria', 'Baile Urbano Secundaria',
  'Flag Football Secundaria', 'Ajedrez Secundaria',
];

/** Sinónimos → nombre de deporte canónico. Clave normalizada. */
const SPORT_ALIASES: Record<string, string> = {
  futbol: 'Fútbol',
  'futbol soccer': 'Fútbol',
  voleibol: 'Voleibol',
  volleyball: 'Voleibol',
  baloncesto: 'Basketball',
  basketball: 'Basketball',
  basquetbol: 'Basketball',
  basket: 'Basketball',
  'baile urbano': 'Baile Urbano',
  baile: 'Baile Urbano',
  'flag football': 'Flag Football',
  flag: 'Flag Football',
  porrismo: 'Porrismo',
  ajedrez: 'Ajedrez',
};

/** Regla (a): categoría → nivel, sólo para los deportes que la usan. */
const CATEGORIA_NIVEL: Record<string, Record<string, Level>> = {
  Fútbol: { u6: 'Primaria', u8: 'Primaria', u10: 'Primaria', u12: 'Primaria', u14: 'Secundaria', u16: 'Secundaria', u18: 'Secundaria' },
  Voleibol: { u10: 'Primaria', u12: 'Primaria', u15: 'Secundaria', u18: 'Secundaria' },
};

/** Regla (b): grado → nivel. */
const GRADO_NIVEL: Record<string, Level> = {
  kinder: 'Primaria', '1ero': 'Primaria', '2do': 'Primaria', '3ero': 'Primaria',
  '4to': 'Primaria', '5to': 'Primaria', '6to': 'Primaria',
  '7mo': 'Secundaria', '8vo': 'Secundaria', '9no': 'Secundaria',
  '10mo': 'Secundaria', '11vo': 'Secundaria', '12vo': 'Secundaria',
};

// ═════════════════════════════════════════════════════════════════════════════
// Normalización — DEBE dar el mismo resultado que la expresión SQL de sqlNorm()
// ═════════════════════════════════════════════════════════════════════════════

const ACCENT_FROM = 'áéíóúüñàèìòùâêîôûäëïöüçãõ';
const ACCENT_TO = 'aeiouunaeiouaeiouaeioucao';

function normName(s: string): string {
  let out = '';
  for (const ch of (s || '').toLowerCase()) {
    const i = ACCENT_FROM.indexOf(ch);
    out += i >= 0 ? ACCENT_TO[i] : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** La misma normalización, del lado de Postgres. Sin extensión unaccent. */
function sqlNorm(col: string): string {
  return `regexp_replace(trim(translate(lower(${col}), '${ACCENT_FROM}', '${ACCENT_TO}')), '\\s+', ' ', 'g')`;
}

function q(s: string | null | undefined): string {
  if (s === null || s === undefined || s === '') return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
}

// ═════════════════════════════════════════════════════════════════════════════
// CSV (RFC 4180: campos con comillas y comas adentro)
// ═════════════════════════════════════════════════════════════════════════════

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

type RosterRow = Record<string, string>;

function readRoster(path: string): RosterRow[] {
  const grid = parseCsv(readFileSync(path, 'utf8'));
  const header = grid[0].map((h) => h.trim());
  return grid.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const o: RosterRow = {};
      header.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
      return o;
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// Resolución de actividad
// ═════════════════════════════════════════════════════════════════════════════

type Resolved =
  | { ok: true; activity: string; forced?: string }
  | { ok: false; reason: string };

function resolveActivity(rawActivity: string, grade: string, fullName: string): Resolved {
  const raw = rawActivity.trim();
  const catMatch = raw.match(/\bU\s*(\d{1,2})\b/i);
  const categoria = catMatch ? `u${catMatch[1]}` : null;
  const sportRaw = raw.replace(/\bU\s*\d{1,2}\b/i, '').trim();
  const sport = SPORT_ALIASES[normName(sportRaw)];

  if (!sport) return { ok: false, reason: `deporte no reconocido: "${raw}"` };

  let level: Level | null = null;
  let via = '';

  // (a) categoría manda
  if (categoria) {
    const table = CATEGORIA_NIVEL[sport];
    if (!table) return { ok: false, reason: `"${raw}" trae categoría pero ${sport} no usa categorías` };
    const lv = table[categoria];
    if (!lv) return { ok: false, reason: `categoría desconocida "${categoria.toUpperCase()}" para ${sport}` };
    level = lv; via = 'regla (a) categoría';
  }

  // (b) grado
  if (!level && grade) {
    const lv = GRADO_NIVEL[normName(grade)];
    if (!lv) return { ok: false, reason: `grado no reconocido: "${grade}"` };
    level = lv; via = 'regla (b) grado';
  }

  // (c) sin categoría y sin grado
  if (!level) {
    if (SIN_GRADO_SIEMPRE_PRIMARIA.includes(sport)) { level = 'Primaria'; via = 'regla (c) deporte sólo-primaria'; }
    else if ((SIN_GRADO_WHITELIST[sport] || []).some((n) => normName(n) === normName(fullName))) {
      level = 'Primaria'; via = 'regla (c) whitelist';
    } else return { ok: false, reason: `${sport} sin categoría y sin grado, y no está en la whitelist de la regla (c)` };
  }

  let forced: string | undefined;
  if (level === 'Secundaria' && SPORTS_SOLO_PRIMARIA.includes(sport)) {
    forced = `${sport} Secundaria no existe como actividad (grado ${grade}, ${via}) → se lo mandó a Primaria`;
    level = 'Primaria';
  }

  const activity = `${sport} ${level}`;
  if (!ACTIVITIES.includes(activity)) return { ok: false, reason: `actividad inexistente: "${activity}"` };
  return { ok: true, activity, forced };
}

function splitActivities(cell: string): string[] {
  return cell.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

// ═════════════════════════════════════════════════════════════════════════════
// Prod (solo lectura)
// ═════════════════════════════════════════════════════════════════════════════

type ProdStudent = { id: string; full_name: string; grade: string | null };

function readEnvLocal(): Record<string, string> {
  const p = join(REPO, '.env.local');
  if (!existsSync(p)) throw new Error('Falta .env.local — lo necesito para leer prod (solo lectura).');
  const env: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function getProd(path: string): Promise<unknown> {
  const env = readEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchProdStudents(): Promise<ProdStudent[]> {
  return (await getProd('students?select=id,full_name,grade&order=full_name')) as ProdStudent[];
}

/**
 * Enrollments que YA existen, como pares "nombre normalizado → actividad".
 * Hacen falta para el conteo esperado: el seed sólo AGREGA, nunca borra, así
 * que el total final es la UNIÓN de lo que hay con lo que se planifica. Sin
 * esto, un chico que está en prod pero no en el CSV (ej. el caso Sergio
 * Salomon) haría que la verificación marque "REVISAR" sin que nada esté mal.
 */
async function fetchProdEnrollmentPairs(): Promise<Set<string>> {
  const raw = (await getProd(
    'enrollments?select=students(full_name),activities(name,is_active)',
  )) as { students: { full_name: string } | null; activities: { name: string; is_active: boolean } | null }[];
  const out = new Set<string>();
  for (const e of raw) {
    if (!e.students || !e.activities || !e.activities.is_active) continue;
    out.add(`${normName(e.students.full_name)}|${e.activities.name}`);
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// Plan
// ═════════════════════════════════════════════════════════════════════════════

type PlannedStudent = {
  fullName: string;
  grade: string | null;
  activities: string[];
  existing: boolean;
  csvName?: string;
};

type Pendiente = { nombre: string; actividad: string; motivo: string };
type Nota = { nombre: string; detalle: string };

type Plan = {
  students: PlannedStudent[];
  pendientes: Pendiente[];
  notas: Nota[];
  renames: { from: string; to: string; reason: string }[];
  totalRows: number;
  includedRows: number;
  /** students que ya había en CIDMI antes de correr el seed (incluye demo). */
  prodCountBefore: number;
  /** pares "nombre normalizado|actividad" que ya existen en prod. */
  existingPairs: Set<string>;
};

function buildPlan(rows: RosterRow[], prod: ProdStudent[], prodPairs: Set<string>): Plan {
  const prodByNorm = new Map(prod.map((s) => [normName(s.full_name), s]));
  const overrideByCsv = new Map(OVERRIDES.map((o) => [normName(o.csvName), o]));

  const included = rows.filter(
    (r) => r['Actividad(es)'] !== '' && !normName(r['Estatus']).toUpperCase().includes('NO CONTINUAR'),
  );

  const students: PlannedStudent[] = [];
  const pendientes: Pendiente[] = [];
  const notas: Nota[] = [];
  const renames: { from: string; to: string; reason: string }[] = [];

  for (const o of OVERRIDES) {
    if (o.renameProdFrom) renames.push({ from: o.renameProdFrom, to: o.canonical, reason: o.reason });
  }

  for (const r of included) {
    const csvName = r['Nombre'];
    const ov = overrideByCsv.get(normName(csvName));
    const fullName = ov ? ov.canonical : csvName;
    // students.grade es NOT NULL → nunca null. Sin grado en el CSV = SIN_GRADO.
    const grade = ov?.forceGrade ?? (r['Grado'] || SIN_GRADO);

    const acts = new Set<string>();
    for (const raw of splitActivities(r['Actividad(es)'])) {
      const res = resolveActivity(raw, r['Grado'], csvName);
      if (res.ok) {
        acts.add(res.activity);
        if (res.forced) notas.push({ nombre: fullName, detalle: res.forced });
      } else {
        pendientes.push({ nombre: csvName, actividad: raw, motivo: res.reason });
      }
    }
    if (acts.size === 0) continue;

    // ¿ya existe en prod? Después del rename, el canónico es el que matchea.
    const renamed = renames.find((x) => normName(x.to) === normName(fullName));
    const existing = prodByNorm.has(normName(fullName)) || (renamed ? prodByNorm.has(normName(renamed.from)) : false);

    students.push({ fullName, grade, activities: [...acts].sort(), existing, csvName });
  }

  // Los pares existentes se reescriben con el nombre canónico: después del
  // rename, el enrollment de "Gialuca Bravo" es el de "Gianluca Bravo".
  const existingPairs = new Set<string>();
  for (const pair of prodPairs) {
    const i = pair.indexOf('|');
    const nombre = pair.slice(0, i);
    const act = pair.slice(i + 1);
    const rn = renames.find((x) => normName(x.from) === nombre);
    existingPairs.add(`${rn ? normName(rn.to) : nombre}|${act}`);
  }

  return {
    students, pendientes, notas, renames,
    totalRows: rows.length,
    includedRows: included.length,
    prodCountBefore: prod.length,
    existingPairs,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SQL
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Bloque reutilizable: siembra N students + sus enrollments a partir de una
 * lista corta. Lo usa tanto el seed completo como el addendum del delta que
 * Kassandra devuelva después de revisar la lista por actividad.
 */
function renderRosterBlock(students: PlannedStudent[], tableName: string): string {
  const rosterRows: string[] = [];
  for (const s of students) {
    for (const a of s.activities) {
      rosterRows.push(`  (${q(s.fullName)}, ${q(s.grade)}, ${q(a)})`);
    }
  }

  return `
-- Tabla temporal con el roster. ON COMMIT DROP: no sobrevive a la transacción.
CREATE TEMP TABLE ${tableName} (
  full_name     text not null,
  grade         text,
  activity_name text not null
) ON COMMIT DROP;

INSERT INTO ${tableName} (full_name, grade, activity_name) VALUES
${rosterRows.join(',\n')};

-- ── students nuevos ───────────────────────────────────────────────────────
-- Guard por nombre NORMALIZADO (sin acentos, minúsculas, espacios colapsados),
-- no por igualdad literal: "Sofía Pérez" y "Sofia Perez" son el mismo niño.
-- DISTINCT ON el nombre NORMALIZADO, no sobre (full_name, grade): si la misma
-- persona viniera dos veces con grados distintos, un DISTINCT simple daría dos
-- filas y las dos pasarían el NOT EXISTS (se evalúa contra el snapshot previo
-- al statement) → duplicado. Con DISTINCT ON sale una sola.
INSERT INTO students (school_id, parent_id, full_name, grade, is_active)
SELECT sc.id, pa.id, r.full_name, r.grade, true
FROM (
  SELECT DISTINCT ON (${sqlNorm('full_name')}) full_name, grade
  FROM ${tableName}
  ORDER BY ${sqlNorm('full_name')}, grade NULLS LAST
) r
CROSS JOIN (SELECT id FROM schools WHERE slug = ${q(SCHOOL_SLUG)}) sc
CROSS JOIN (SELECT id FROM users WHERE email = ${q(PARENT_EMAIL)}) pa
WHERE NOT EXISTS (
  SELECT 1 FROM students st
  WHERE st.school_id = sc.id
    AND ${sqlNorm('st.full_name')} = ${sqlNorm('r.full_name')}
);

-- ── grade: sólo rellena los que no tienen dato ────────────────────────────
-- Nunca pisa un grade real: prod puede tener el dato bueno (ej. Gianluca Bravo,
-- que conserva 7mo aunque el CSV diga 10mo).
-- Trata ${q(SIN_GRADO)} igual que NULL, así el addendum corrige a los que
-- Kassandra complete sin tener que tocar este seed.
UPDATE students st
SET grade = r.grade
FROM (
  SELECT DISTINCT ON (${sqlNorm('full_name')}) full_name, grade
  FROM ${tableName}
  WHERE grade IS NOT NULL AND grade <> ${q(SIN_GRADO)}
  ORDER BY ${sqlNorm('full_name')}, grade
) r
JOIN schools sc ON sc.slug = ${q(SCHOOL_SLUG)}
WHERE st.school_id = sc.id
  AND ${sqlNorm('st.full_name')} = ${sqlNorm('r.full_name')}
  AND (st.grade IS NULL OR st.grade = ${q(SIN_GRADO)});

-- ── enrollments ───────────────────────────────────────────────────────────
INSERT INTO enrollments (student_id, activity_id, status)
SELECT st.id, ac.id, 'active'::enrollment_status
FROM ${tableName} r
JOIN schools sc ON sc.slug = ${q(SCHOOL_SLUG)}
JOIN students st ON st.school_id = sc.id AND ${sqlNorm('st.full_name')} = ${sqlNorm('r.full_name')}
-- Sin filtro por ac.is_active a propósito: el addendum tiene que poder llenar
-- una actividad que quedó desactivada por vacía. La reactivación va aparte.
JOIN activities ac ON ac.school_id = sc.id AND ac.name = r.activity_name
WHERE NOT EXISTS (
  SELECT 1 FROM enrollments e WHERE e.student_id = st.id AND e.activity_id = ac.id
);
`;
}

function renderPreflight(): string {
  return `
-- ============================================================
-- 0. Pre-flight
-- ============================================================

DO $$
DECLARE
  sc_id uuid;
  pa_id uuid;
  act_n int;
BEGIN
  SELECT id INTO sc_id FROM schools WHERE slug = ${q(SCHOOL_SLUG)};
  IF sc_id IS NULL THEN
    RAISE EXCEPTION 'Pre-flight: no existe la school ${SCHOOL_SLUG}.';
  END IF;

  SELECT id INTO pa_id FROM users WHERE email = ${q(PARENT_EMAIL)};
  IF pa_id IS NULL THEN
    RAISE EXCEPTION 'Pre-flight: no existe el parent placeholder ${PARENT_EMAIL}.';
  END IF;

  -- Se chequea que EXISTAN las 13 por nombre, no que estén activas: este script
  -- desactiva las vacías al final, así que en un re-run habría menos de 13
  -- activas y un chequeo por is_active lo haría fallar sin motivo.
  SELECT count(*) INTO act_n
  FROM activities
  WHERE school_id = sc_id AND name IN (${ACTIVITIES.map(q).join(', ')});

  IF act_n <> ${ACTIVITIES.length} THEN
    RAISE EXCEPTION
      'Pre-flight: encontré % de las ${ACTIVITIES.length} actividades de CIDMI. '
      'Corré primero seed-activities-sprint-3.sql (Tarea 3, commit 7acdd0d).', act_n;
  END IF;
END $$;
`;
}

function renderRenames(plan: Plan): string {
  if (!plan.renames.length) return '';
  const stmts = plan.renames.map(
    (r) => `-- ${r.reason}
UPDATE students st
SET full_name = ${q(r.to)}
FROM schools sc
WHERE sc.slug = ${q(SCHOOL_SLUG)}
  AND st.school_id = sc.id
  AND ${sqlNorm('st.full_name')} = ${sqlNorm(q(r.from))};`,
  );
  return `
-- ============================================================
-- 1. Renames en prod (typos detectados al cruzar con el CSV)
-- ============================================================
-- Van ANTES del seed: si no, el guard de dedupe no reconoce al niño y lo duplica.

${stmts.join('\n\n')}
`;
}

/**
 * Esperado = UNIÓN de los pares que ya existen en prod con los planificados.
 * El seed sólo agrega; lo que ya estaba sigue ahí.
 */
function expectedByActivity(plan: Plan): Map<string, number> {
  const union = new Set(plan.existingPairs);
  for (const s of plan.students) for (const a of s.activities) union.add(`${normName(s.fullName)}|${a}`);
  const expected = new Map<string, number>();
  for (const a of ACTIVITIES) expected.set(a, 0);
  for (const pair of union) {
    const act = pair.slice(pair.indexOf('|') + 1);
    if (expected.has(act)) expected.set(act, (expected.get(act) ?? 0) + 1);
  }
  return expected;
}

/**
 * Actividades que quedan sin un solo niño. Se desactivan (decisión Roberto,
 * 13 sep 2026: en la planilla de asistencia esos grupos no tuvieron una sola X
 * en todo 2026 — no arrancaron). La Tarea 5 genera sesiones sólo para activas,
 * así que a Kassandra no le aparecen clases vacías en el Pad.
 * Si Kassandra confirma que existen, se reactivan con el addendum.
 */
function emptyActivities(plan: Plan): string[] {
  const exp = expectedByActivity(plan);
  return ACTIVITIES.filter((a) => (exp.get(a) ?? 0) === 0);
}

function renderDeactivation(plan: Plan): string {
  const vacias = emptyActivities(plan);
  if (!vacias.length) return '';
  return `
-- ============================================================
-- 3. Desactivar las actividades que quedaron sin un solo niño
-- ============================================================
-- Decisión Roberto, 13 sep 2026: en la planilla de asistencia estos grupos no
-- tuvieron una sola X en todo 2026 — no arrancaron. Se desactivan para que la
-- Tarea 5 no les genere sesiones y Kassandra no vea clases vacías en el Pad.
-- Si confirma que existen, se reactivan con el addendum.

UPDATE activities ac
SET is_active = false
FROM schools sc
WHERE sc.slug = ${q(SCHOOL_SLUG)}
  AND ac.school_id = sc.id
  AND ac.name IN (${vacias.map(q).join(', ')})
  AND ac.is_active;
`;
}

function renderVerification(plan: Plan): string {
  const expected = expectedByActivity(plan);
  const vacias = emptyActivities(plan);
  const activas = ACTIVITIES.filter((a) => !vacias.includes(a));
  const rows = activas.map((a) => `    (${q(a)}, ${expected.get(a) ?? 0})`).join(',\n');
  const totalEnroll = activas.reduce((n, a) => n + (expected.get(a) ?? 0), 0);

  return `
-- ============================================================
-- 4. Verificación — reporte en una columna de texto
-- ============================================================
-- Studio no muestra RAISE NOTICE y sólo renderiza el último statement.

WITH esperado(activity_name, n) AS (VALUES
${rows}
),
sc AS (SELECT id FROM schools WHERE slug = ${q(SCHOOL_SLUG)}),
-- "actual", no "real": real es nombre de tipo en Postgres.
actual AS (
  SELECT ac.name AS activity_name, count(e.id)::int AS n
  FROM activities ac
  JOIN sc ON sc.id = ac.school_id
  LEFT JOIN enrollments e ON e.activity_id = ac.id
  WHERE ac.is_active
  GROUP BY ac.name
),
lineas(ord, line) AS (
  SELECT 1, '=== SEED SPRINT 3 · CIDMI ==='
  UNION ALL SELECT 2, format('students en CIDMI: %s  (antes del seed: ${plan.prodCountBefore} · esperado después: ${plan.prodCountBefore + plan.students.filter((s) => !s.existing).length})',
    (SELECT count(*) FROM students st JOIN sc ON sc.id = st.school_id))
  UNION ALL SELECT 3, format('actividades activas: %s  (esperado ${activas.length} — se desactivaron ${vacias.length} por vacías)',
    (SELECT count(*) FROM activities ac JOIN sc ON sc.id = ac.school_id WHERE ac.is_active))
  UNION ALL SELECT 4, format('desactivadas ahora: %s  (esperado: ${vacias.join(' · ') || 'ninguna'})',
    coalesce((SELECT string_agg(ac.name, ' · ' ORDER BY ac.name) FROM activities ac JOIN sc ON sc.id = ac.school_id
              WHERE NOT ac.is_active AND ac.name IN (${ACTIVITIES.map(q).join(', ')})), 'ninguna'))
  UNION ALL SELECT 5, format('enrollments en las activas: %s  (esperado ${totalEnroll})',
    (SELECT coalesce(sum(n), 0) FROM actual))
  UNION ALL SELECT 6, ''
  UNION ALL SELECT 7, '--- enrollments por actividad ACTIVA: real vs esperado ---'
  UNION ALL
  SELECT 10, format('%-26s real %-5s esperado %-5s %s',
                    e.activity_name, a.n, e.n,
                    CASE WHEN a.n = e.n THEN 'OK' ELSE '<<< REVISAR' END)
  FROM esperado e JOIN actual a USING (activity_name)
)
SELECT line AS reporte FROM lineas ORDER BY ord, line;
`;
}

function buildSeedSQL(plan: Plan): string {
  const nuevos = plan.students.filter((s) => !s.existing).length;
  const match = plan.students.filter((s) => s.existing).length;
  const enroll = plan.students.reduce((n, s) => n + s.activities.length, 0);

  return `-- supabase/scripts/private/seed-cidmi-pilot-sprint-3.sql
-- ⚠️ GENERADO — no editar a mano. Lo escribe supabase/scripts/generate-cidmi-seed.ts
-- ⚠️ PII: nombres de menores. NO commitear. La carpeta private/ está en .gitignore.
--
-- Generado: ${new Date().toISOString()}
-- Fuente  : private/cidmi-roster-2026.csv (${plan.totalRows} filas, ${plan.includedRows} incluidas)
--
-- students planificados : ${plan.students.length}  (${nuevos} nuevos, ${match} ya en prod)
-- enrollments           : ${enroll}
-- renames en prod       : ${plan.renames.length}
-- pendientes (no entran): ${plan.pendientes.length}  → ver private/pendientes-kassandra.md
-- actividades desactivadas por vacías: ${emptyActivities(plan).length}${emptyActivities(plan).length ? ` (${emptyActivities(plan).join(', ')})` : ''}
--
-- EJECUTAR EN: Supabase Studio SQL Editor (service_role bypassea RLS).
-- IDEMPOTENTE: re-run safe. Guards WHERE NOT EXISTS por nombre normalizado
-- (students) y por (student_id, activity_id) (enrollments).

BEGIN;
${renderPreflight()}${renderRenames(plan)}
-- ============================================================
-- 2. Roster: students + enrollments
-- ============================================================
${renderRosterBlock(plan.students, '_seed_roster')}${renderDeactivation(plan)}${renderVerification(plan)}
COMMIT;

-- End of seed-cidmi-pilot-sprint-3.sql
`;
}

/**
 * ADDENDUM — para el delta que Kassandra devuelva después de revisar la lista
 * por actividad (Voleibol −10, Baloncesto −4, etc.).
 *
 *   1. Escribí private/delta.json:
 *        [{ "fullName": "Nombre Apellido", "grade": "8vo",
 *           "activities": ["Voleibol Secundaria"] }]
 *   2. node supabase/scripts/generate-cidmi-seed.ts --addendum private/delta.json
 *   3. Revisá y corré private/seed-cidmi-addendum.sql en Studio.
 *
 * Mismos guards que el seed grande: no duplica un student que ya exista ni un
 * enrollment que ya exista, así que es seguro correrlo las veces que haga falta.
 */
export function buildAddendumSQL(entries: PlannedStudent[]): string {
  const bad = entries.flatMap((e) => e.activities.filter((a) => !ACTIVITIES.includes(a)).map((a) => `${e.fullName}: "${a}"`));
  if (bad.length) throw new Error(`Actividades que no existen:\n  ${bad.join('\n  ')}\nVálidas:\n  ${ACTIVITIES.join('\n  ')}`);

  return `-- supabase/scripts/private/seed-cidmi-addendum.sql
-- ⚠️ GENERADO — no editar a mano.  ⚠️ PII: NO commitear.
-- Generado: ${new Date().toISOString()}
-- students: ${entries.length} · enrollments: ${entries.reduce((n, e) => n + e.activities.length, 0)}

BEGIN;
${renderPreflight()}
-- Reactivar las actividades que este addendum toca: el seed grande desactiva
-- las que quedaron vacías, y si Kassandra confirma que el grupo sí existe hay
-- que volver a prenderlo o la Tarea 5 no le genera sesiones.
UPDATE activities ac
SET is_active = true
FROM schools sc
WHERE sc.slug = ${q(SCHOOL_SLUG)}
  AND ac.school_id = sc.id
  AND ac.name IN (${[...new Set(entries.flatMap((e) => e.activities))].map(q).join(', ')})
  AND NOT ac.is_active;
${renderRosterBlock(entries, '_addendum_roster')}
SELECT format('addendum OK — students CIDMI: %s · actividades activas: %s',
  (SELECT count(*) FROM students st JOIN schools sc ON sc.id = st.school_id WHERE sc.slug = ${q(SCHOOL_SLUG)}),
  (SELECT count(*) FROM activities ac JOIN schools sc ON sc.id = ac.school_id WHERE sc.slug = ${q(SCHOOL_SLUG)} AND ac.is_active)) AS reporte;

COMMIT;
`;
}

// ═════════════════════════════════════════════════════════════════════════════
// pendientes-kassandra.md
// ═════════════════════════════════════════════════════════════════════════════

function buildPendientes(plan: Plan): string {
  const porActividad = new Map<string, number>();
  for (const s of plan.students) for (const a of s.activities) porActividad.set(a, (porActividad.get(a) ?? 0) + 1);

  const L: string[] = [];
  L.push('# Pendientes para Kassandra — Sprint 3 (piloto CIDMI)');
  L.push('');
  L.push(`> Generado ${new Date().toISOString().slice(0, 10)} por \`supabase/scripts/generate-cidmi-seed.ts\`.`);
  L.push('> ⚠️ PII: nombres de menores. Este archivo NO se commitea.');
  L.push('');
  L.push(`**DIA_1 del piloto: ${DIA_1_LABEL}.** Ventana: ${VENTANA_LABEL}.`);
  L.push('');
  const vacias = ACTIVITIES.filter((a) => (porActividad.get(a) ?? 0) === 0);
  if (vacias.length) {
    L.push('## 0 · Actividades DESACTIVADAS por quedar sin un solo niño');
    L.push('');
    L.push('Ningún niño del CSV mapea a estas, así que el seed las apagó');
    L.push('(`is_active = false`):');
    L.push('');
    for (const a of vacias) L.push(`- **${a}**`);
    L.push('');
    L.push('**Razón (Roberto, 13 sep 2026):** en la planilla de asistencia esos');
    L.push('grupos no tuvieron una sola X en todo 2026 — no arrancaron. La Tarea 5');
    L.push('genera sesiones sólo para actividades activas, así que a Kassandra no le');
    L.push('van a aparecer clases vacías en el Pad.');
    L.push('');
    L.push('**Si Kassandra confirma que alguno sí existe:** se reactiva solo con el');
    L.push('addendum de §4 — el addendum prende la actividad antes de insertar.');
    L.push('');
  }
  L.push('## 1 · NO se insertaron — falta información');
  L.push('');
  if (plan.pendientes.length === 0) L.push('_Ninguno._');
  else {
    L.push('| Nombre | Actividad | Motivo |');
    L.push('|---|---|---|');
    for (const p of plan.pendientes) L.push(`| ${p.nombre} | ${p.actividad} | ${p.motivo} |`);
    L.push('');
    L.push('**Qué preguntar:** en qué nivel va cada uno (Primaria o Secundaria), o el grado.');
    L.push('Con eso se agregan con el addendum (ver §4) sin tocar el seed.');
  }
  L.push('');
  L.push('## 2 · Entraron, pero confirmar');
  L.push('');
  L.push('| Nombre | Qué confirmar |');
  L.push('|---|---|');
  for (const n of plan.notas) L.push(`| ${n.nombre} | ${n.detalle} |`);
  for (const o of OVERRIDES) {
    if (o.forceGrade) L.push(`| ${o.canonical} | Confirmar grado: ¿${o.forceGrade} o el que trae el CSV? Se usó ${o.forceGrade}. |`);
  }
  for (const k of PROD_KEEP_AS_IS) L.push(`| ${k.name} | ¿Existe todavía? Si no, desactivar. ${k.note} |`);
  L.push('');
  L.push('## 3 · Verificar conteos contra su lista');
  L.push('');
  L.push('Los que quedaron por debajo de lo esperado en el cruce del horario:');
  L.push('');
  L.push('| Actividad | Sembrados | Esperado (cruce horario) |');
  L.push('|---|---|---|');
  L.push(`| Voleibol Secundaria | ${porActividad.get('Voleibol Secundaria') ?? 0} | ~28 |`);
  L.push(`| Voleibol Primaria | ${porActividad.get('Voleibol Primaria') ?? 0} | ~15 |`);
  L.push(`| Basketball Primaria | ${porActividad.get('Basketball Primaria') ?? 0} | ~13 (Basketball total) |`);
  L.push(`| Basketball Secundaria | ${porActividad.get('Basketball Secundaria') ?? 0} | — |`);
  L.push('');
  L.push('Lista completa de lo sembrado, para mandarle:');
  L.push('');
  L.push('| Actividad | Niños |');
  L.push('|---|---|');
  for (const a of ACTIVITIES) L.push(`| ${a} | ${porActividad.get(a) ?? 0} |`);
  L.push('');
  L.push('## 4 · Cómo agregar los que falten');
  L.push('');
  L.push('```bash');
  L.push('# 1. private/delta.json');
  L.push('#    [{ "fullName": "Nombre Apellido", "grade": "8vo",');
  L.push('#       "activities": ["Voleibol Secundaria"] }]');
  L.push('node supabase/scripts/generate-cidmi-seed.ts --addendum private/delta.json');
  L.push('# 2. revisar y correr private/seed-cidmi-addendum.sql en Studio');
  L.push('```');
  L.push('');
  L.push('Mismos guards que el seed: no duplica students ni enrollments existentes.');
  L.push('');

  const sinGrado = plan.students.filter((s) => s.grade === SIN_GRADO);
  L.push(`## 5 · Sin grado (${sinGrado.length})`);
  L.push('');
  L.push('`students.grade` es NOT NULL, así que estos entraron con el literal');
  L.push(`\`${SIN_GRADO}\`. **No se les inventó un grado** a partir del nivel ni de la`);
  L.push('categoría. En el Pad aparecen agrupados bajo "Otros" — se ven y se les');
  L.push('puede pasar asistencia normal.');
  L.push('');
  L.push('Cuando Kassandra complete los grados, se corrigen con el addendum de §4:');
  L.push(`el UPDATE trata \`${SIN_GRADO}\` igual que NULL, así que los pisa.`);
  L.push('');
  L.push('| Nombre | Actividad(es) |');
  L.push('|---|---|');
  for (const s of sinGrado.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))) {
    L.push(`| ${s.fullName} | ${s.activities.join(' · ')} |`);
  }
  L.push('');

  // Nota operativa para Roberto. Vive acá y no en el .md a mano: el .md es
  // generado, así que una nota escrita ahí se pierde en la próxima corrida.
  L.push('## 6 · Nota para Roberto: el primer "Enviar" post-deploy en Safari iOS');
  L.push('');
  L.push('Si en el **primer** intento después de un deploy Kassandra ve');
  L.push('`"The string did not match the expected pattern"` o `"Load failed"`');
  L.push('en Safari del iPhone: **es transitorio, no es un bug.** Que reintente');
  L.push('el mismo botón y va a andar.');
  L.push('');
  L.push('Causa (AGENTS.md §9, incidente del 15 jun 2026): es el primer `fetch`');
  L.push('contra una Function recién desplegada — cold start + handshake de red del');
  L.push('WebView. `"Load failed"` es el `TypeError` genérico de `fetch` en WebKit');
  L.push('cuando la request se aborta a nivel red, no un error de la aplicación.');
  L.push('Se auditó en git: no hay ningún commit que introduzca o maneje esos');
  L.push('strings, y no se volvió a reproducir.');
  L.push('');
  L.push('**No abras un bug por esto** salvo que sea REPRODUCIBLE: que falle en los');
  L.push('reintentos, o en requests que no son el primero post-deploy. Ahí sí mirá');
  L.push('el status HTTP real y el body del POST.');
  L.push('');
  L.push('Cuenta como bloqueo para la métrica del día 14 **sólo si Kassandra no');
  L.push('puede seguir después de reintentar.** Un reintento que funciona no es un');
  L.push('bloqueo — no lo sumes a los "≤ 2 bloqueos que requirieron a Roberto".');
  L.push('');
  return L.join('\n');
}

// ═════════════════════════════════════════════════════════════════════════════
// main
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const addIdx = args.indexOf('--addendum');

  if (addIdx !== -1) {
    const rel = args[addIdx + 1];
    if (!rel) throw new Error('Uso: --addendum <archivo.json>');
    const path = resolve(join(REPO, 'supabase/scripts'), rel);
    const entries = JSON.parse(readFileSync(path, 'utf8')) as PlannedStudent[];
    const out = join(REPO, 'supabase/scripts/private/seed-cidmi-addendum.sql');
    writeFileSync(out, buildAddendumSQL(entries.map((e) => ({ ...e, grade: e.grade ?? null, existing: false }))));
    console.log(`addendum escrito: ${out}  (${entries.length} students)`);
    return;
  }

  if (!existsSync(ROSTER_CSV)) throw new Error(`No encuentro el roster: ${ROSTER_CSV}`);

  const rows = readRoster(ROSTER_CSV);
  const prod = await fetchProdStudents();
  const prodPairs = await fetchProdEnrollmentPairs();
  const plan = buildPlan(rows, prod, prodPairs);

  if (plan.pendientes.length > MAX_PENDIENTES) {
    console.error(`\n⛔ ${plan.pendientes.length} pendientes (máximo ${MAX_PENDIENTES}). Algo está mal en el mapeo:`);
    for (const p of plan.pendientes) console.error(`   ${p.nombre} · ${p.actividad} · ${p.motivo}`);
    console.error('\nNo escribí nada. Revisá las reglas antes de seguir.\n');
    process.exit(1);
  }

  writeFileSync(OUT_SQL, buildSeedSQL(plan));
  writeFileSync(OUT_PENDIENTES, buildPendientes(plan));

  // ── resumen a stdout ──
  const nuevos = plan.students.filter((s) => !s.existing);
  const match = plan.students.filter((s) => s.existing);
  const porActividad = new Map<string, number>();
  for (const s of plan.students) for (const a of s.activities) porActividad.set(a, (porActividad.get(a) ?? 0) + 1);

  console.log('');
  console.log('=== SEED SPRINT 3 · CIDMI ===');
  console.log(`filas CSV            : ${plan.totalRows}`);
  console.log(`entran por la regla  : ${plan.includedRows}`);
  console.log(`students planificados: ${plan.students.length}  (${nuevos.length} nuevos · ${match.length} ya en prod)`);
  console.log(`enrollments          : ${plan.students.reduce((n, s) => n + s.activities.length, 0)}`);
  console.log(`renames en prod      : ${plan.renames.length}`);
  console.log(`pendientes           : ${plan.pendientes.length}`);
  console.log(`sin grado            : ${plan.students.filter((s) => s.grade === SIN_GRADO).length}  (entran como '${SIN_GRADO}')`);
  console.log('');
  console.log('--- enrollments por actividad ---');
  for (const a of ACTIVITIES) {
    const n = porActividad.get(a) ?? 0;
    console.log(`  ${a.padEnd(26)} ${String(n).padStart(3)}${n === 0 ? '   <<< SIN UN SOLO NIÑO' : ''}`);
  }
  console.log('');
  console.log('--- students con 2+ actividades ---');
  const multi = plan.students.filter((s) => s.activities.length > 1);
  console.log(`  ${multi.length}`);
  console.log('');
  console.log(`SQL       : ${OUT_SQL}`);
  console.log(`pendientes: ${OUT_PENDIENTES}`);
  console.log('');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
