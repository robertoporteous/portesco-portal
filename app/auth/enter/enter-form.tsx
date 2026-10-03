"use client";

import { useState } from "react";

// Botón de un solo toque (2 oct 2026). En iPhone, con red lenta, un doble toque
// mandaba dos GET a /auth/callback: el segundo encontraba el token gastado y
// tapaba la sesión recién creada con /login. Se desactiva al primer submit.
export function EnterForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [sent, setSent] = useState(false);
  return (
    <form
      method="GET"
      action="/auth/callback"
      onSubmit={(e) => {
        if (sent) e.preventDefault();
        setSent(true);
      }}
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <button
        type="submit"
        disabled={sent}
        className="w-full rounded-xl py-3 text-base font-semibold text-white disabled:opacity-70"
        style={{ backgroundColor: "var(--portesco-red)" }}
      >
        {sent ? "Entrando…" : "Entrar al Portal"}
      </button>
    </form>
  );
}
