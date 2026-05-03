// Magic link login page — Sprint 1 placeholder
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-white px-6">
      <div className="flex flex-col gap-6 w-full max-w-sm">
        <div className="flex flex-col items-center gap-1">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold mb-2"
            style={{ backgroundColor: "var(--portesco-blue)" }}
          >
            P
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
            Bienvenido
          </h1>
          <p className="text-sm text-center" style={{ color: "var(--portesco-gray-mid)" }}>
            Ingresa tu correo electrónico para recibir tu enlace de acceso
          </p>
        </div>
        {/* Auth form — Supabase magic link — Sprint 1 */}
        <div className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            className="h-12 px-4 rounded-xl border border-gray-200 text-base outline-none focus:border-blue-900"
          />
          <button
            className="h-12 rounded-xl text-white font-medium"
            style={{ backgroundColor: "var(--portesco-red)" }}
          >
            Enviar enlace de acceso
          </button>
        </div>
      </div>
    </main>
  );
}
