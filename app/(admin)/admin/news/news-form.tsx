"use client";

import { useActionState, useEffect, useRef } from "react";
import { createNews, type FormState } from "../actions";
import { Field, SubmitButton, FormMessage, inputCls } from "@/components/admin/form-bits";

const KINDS: { value: string; label: string }[] = [
  { value: "announcement", label: "Anuncio" },
  { value: "result", label: "Resultado de partido" },
  { value: "photo", label: "Foto / galería" },
  { value: "promo", label: "Promoción" },
  { value: "payment_reminder", label: "Recordatorio de pago" },
];

export function NewsForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createNews, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Nueva noticia</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Colegio">
          <select name="school_id" required className={inputCls} defaultValue={schools.length === 1 ? schools[0].id : ""}>
            <option value="" disabled>Elige…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select name="kind" className={inputCls} defaultValue="announcement">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Título">
        <input name="title" required minLength={3} maxLength={140} className={inputCls} placeholder="Ej. Festival de fin de año · sábado 12 dic" />
      </Field>
      <Field label="Texto" hint="Lenguaje claro para padres. Para un resultado escribe el marcador, ej. “Colegio Demo 3 – 1 Rival”.">
        <textarea name="body" rows={4} maxLength={4000} className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Enlace (opcional)">
          <input name="link_url" type="url" className={inputCls} placeholder="https://…" />
        </Field>
        <Field label="Texto del enlace">
          <input name="link_label" maxLength={60} className={inputCls} placeholder="Ver fotos" />
        </Field>
        <Field label="Imagen (URL, opcional)">
          <input name="image_url" className={inputCls} placeholder="https://… o /images/…" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="is_published" value="on" defaultChecked className="size-4" />
        Publicar ahora (los padres la ven de inmediato)
      </label>
      <input type="hidden" name="is_published" value="off" />
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <SubmitButton>Publicar noticia</SubmitButton>
      </div>
    </form>
  );
}
