"use client";

import { useActionState, useEffect, useRef } from "react";
import { createEvent, type FormState } from "../actions";
import { Field, SubmitButton, FormMessage, inputCls } from "@/components/admin/form-bits";

const TYPES: { value: string; label: string }[] = [
  { value: "match", label: "Partido" },
  { value: "tournament", label: "Torneo" },
  { value: "festival", label: "Festival" },
  { value: "meeting", label: "Reunión de padres" },
  { value: "practice", label: "Práctica especial" },
  { value: "other", label: "Otro" },
];

export function EventForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createEvent, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Nuevo evento</h2>
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
          <select name="event_type" className={inputCls} defaultValue="match">
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Título">
        <input name="title" required minLength={3} maxLength={140} className={inputCls} placeholder="Ej. Liga FCC Sub 18 · Semana 7" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Inicio (hora Panamá)">
          <input name="starts_at" type="datetime-local" required className={inputCls} />
        </Field>
        <Field label="Fin (opcional)">
          <input name="ends_at" type="datetime-local" className={inputCls} />
        </Field>
        <Field label="Lugar">
          <input name="location" maxLength={200} className={inputCls} placeholder="Ej. Cancha CDE SC" />
        </Field>
      </div>
      <Field label="Detalle (opcional)" hint="Qué llevar, a qué hora llegar, uniforme.">
        <textarea name="description" rows={3} maxLength={4000} className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="is_published" value="on" defaultChecked className="size-4" />
        Publicar ahora (aparece en el calendario de los padres)
      </label>
      <input type="hidden" name="is_published" value="off" />
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <SubmitButton>Publicar evento</SubmitButton>
      </div>
    </form>
  );
}
