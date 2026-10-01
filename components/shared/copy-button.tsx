"use client";

import { useState } from "react";

// Botón "Copiar" para datos de pago (Sprint 4 T5). Client Component mínimo:
// solo estado de feedback "Copiado". Si el navegador no expone clipboard
// (http sin TLS, WebView vieja), selecciona el texto en un prompt de fallback.
export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      window.prompt("Copia este dato:", value);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-white"
      style={{ backgroundColor: done ? "#10B981" : "var(--portesco-blue)" }}
      aria-live="polite"
    >
      {done ? "Copiado" : label}
    </button>
  );
}
