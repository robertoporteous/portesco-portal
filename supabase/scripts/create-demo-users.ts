/**
 * supabase/scripts/create-demo-users.ts
 * Sprint 4 — Preview Tech Week. T0: los auth users del Colegio Demo Portesco.
 *
 * QUÉ HACE
 *   Crea (si no existen) los 4 auth users demo con email_confirm = true, sin
 *   mandar ningún mail. Solo toca auth.users: el mirror en public.users, el
 *   colegio y todo lo demás lo hace seed-demo-school.sql, que resuelve por email.
 *
 * CÓMO SE CORRE
 *   node --env-file=.env.local supabase/scripts/create-demo-users.ts
 *   Node 25 ejecuta TypeScript nativo. Necesita NEXT_PUBLIC_SUPABASE_URL y
 *   SUPABASE_SERVICE_ROLE_KEY.
 *
 * IDEMPOTENTE: si el email ya existe en auth.users, lo salta.
 * BORRAR: cleanup-demo-school.sql borra estos 4 users (por email exacto).
 */

import { createClient } from '@supabase/supabase-js';

const DEMO_EMAILS = [
  'demo-padre@portesco-test.com',
  'demo-padre2@portesco-test.com',
  'demo-coord@portesco-test.com',
  'demo-prof@portesco-test.com',
] as const;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Corré con --env-file=.env.local');
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 4 users nuevos + los que ya hay: una página de 1000 alcanza de sobra.
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw new Error(`listUsers falló: ${listError.message}`);
const existing = new Set(list.users.map((u) => u.email));

for (const email of DEMO_EMAILS) {
  if (existing.has(email)) {
    console.log(`= ${email} ya existe`);
    continue;
  }
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`createUser falló para ${email}: ${error.message}`);
  console.log(`+ ${email} creado`);
}
