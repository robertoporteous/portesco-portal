// GET /auth/enter?token_hash=…
// Página intermedia para links de acceso generados server-side (Sprint 4,
// supabase/scripts/demo-login-link.ts). Los mensajeros (WhatsApp, iMessage)
// abren cualquier URL para generar la vista previa; si el link fuera directo a
// /auth/callback, esa visita automática gastaría el token de un solo uso antes
// de que la persona lo toque. Esta página NO verifica nada: solo muestra un
// botón. El canje ocurre en /auth/callback cuando el usuario lo toca.
// Ruta pública (proxy.ts deja pasar /auth/*). Sin sesión, sin datos.

export const dynamic = "force-dynamic";

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valid = Boolean(tokenHash);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4 text-center">
        <p className="text-sm font-semibold tracking-wide" style={{ color: "var(--portesco-blue)" }}>
          PORTESCO
        </p>
        {valid ? (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Tu acceso está listo</h1>
            <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
              Toca el botón para entrar al Portal. El enlace sirve una sola vez.
            </p>
            <form method="GET" action="/auth/callback">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type ?? "magiclink"} />
              <button
                type="submit"
                className="w-full rounded-xl py-3 text-base font-semibold text-white"
                style={{ backgroundColor: "var(--portesco-red)" }}
              >
                Entrar al Portal
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Enlace incompleto</h1>
            <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
              Pide un enlace nuevo a tu coordinadora.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
