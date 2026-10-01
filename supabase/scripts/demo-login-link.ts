/**
 * supabase/scripts/demo-login-link.ts
 * Sprint 4 — Preview Tech Week. Genera un link de acceso de un solo uso para un
 * user demo (sus emails @portesco-test.com no tienen buzón, así que el magic
 * link por correo nunca llega).
 *
 * CÓMO SE CORRE (desde la raíz del repo):
 *   node --env-file=.env.local supabase/scripts/demo-login-link.ts padre
 *   roles: padre | padre2 | coord | prof
 *   opcional: --base https://portesco-portal-git-demo-....vercel.app  (default: NEXT_PUBLIC_APP_URL)
 *
 * Imprime UNA URL. Abrirla en el teléfono/navegador crea la sesión y redirige
 * por rol. El token caduca (config de Auth, típicamente 1 h) y es de un solo
 * uso: generá uno nuevo cada vez.
 *
 * Solo users demo-*: el script se niega a generar links de cualquier otro email
 * (AGENTS §9: nunca sesiones de usuarios reales para probar).
 */
import { createClient } from '@supabase/supabase-js';

const ROLE_EMAIL: Record<string, string> = {
  padre: 'demo-padre@portesco-test.com',
  padre2: 'demo-padre2@portesco-test.com',
  coord: 'demo-coord@portesco-test.com',
  prof: 'demo-prof@portesco-test.com',
};

const args = process.argv.slice(2);
const role = args.find((a) => !a.startsWith('--')) ?? '';
const baseIdx = args.indexOf('--base');
const base = (baseIdx >= 0 ? args[baseIdx + 1] : process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

const email = ROLE_EMAIL[role];
if (!email) {
  console.error(`Uso: node --env-file=.env.local supabase/scripts/demo-login-link.ts <padre|padre2|coord|prof> [--base URL]`);
  process.exit(1);
}
if (!base) {
  console.error('Falta --base o NEXT_PUBLIC_APP_URL en .env.local');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Corré con --env-file=.env.local');
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (error) throw new Error(`generateLink falló para ${email}: ${error.message}`);
const tokenHash = data?.properties?.hashed_token;
if (!tokenHash) throw new Error(`Sin hashed_token para ${email}`);

console.log(`${base}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`);
