"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/(admin)/admin/actions";
import { deleteItem, setPublished } from "@/app/(admin)/admin/actions";

// Piezas compartidas de los formularios admin (Sprint 4 T9). Sin shadcn Form:
// inputs nativos + Server Actions. Sin window.confirm (bloquea la automatización
// del navegador y es feo): "Borrar" pide un segundo toque.

export const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--portesco-blue)]/30 focus:border-[color:var(--portesco-blue)]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--portesco-gray-mid)" }}>
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 shrink-0"
      style={{ backgroundColor: "var(--portesco-red)" }}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return <span />;
  return (
    <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
      {state.message}
    </p>
  );
}

export function RowActions({ table, id, published }: { table: "news_items" | "events"; id: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => setPublished(table, id, !published))}
        className="text-xs font-medium rounded-full px-2.5 py-1 border disabled:opacity-50"
        style={
          published
            ? { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", color: "#047857" }
            : { borderColor: "#E5E7EB", backgroundColor: "#F9FAFB", color: "#6B7280" }
        }
        title={published ? "Ocultar a los padres" : "Publicar"}
      >
        {published ? "Publicado" : "Borrador"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            setTimeout(() => setArmed(false), 4000);
            return;
          }
          start(() => deleteItem(table, id));
        }}
        className="text-xs font-medium rounded-full px-2.5 py-1 disabled:opacity-50"
        style={armed ? { backgroundColor: "var(--portesco-red)", color: "white" } : { color: "#6B7280" }}
      >
        {armed ? "¿Borrar?" : "Borrar"}
      </button>
    </div>
  );
}
