"use client";

// Modal de confirmación del profesor (Bloque 3, Tarea 8). Abre desde la
// respuesta del POST (status='pending_confirmation' + el payload `confirmation`
// resuelto server-side). Confirmar → PATCH /api/observations/{id}/confirm, que
// recién ahí inserta mention_assignments (flujo A) → el trigger puebla el perfil.
//
// UX (PRD §4.4): drawer bottom-sheet mobile-first. Confirmar es la acción
// PRIMARIA (aceptar lo detectado tal cual). "Corregir" revela los controles de
// edición por mención (reasignar / sentiment / descartar) sin ensuciar la vista
// por defecto. "Re-grabar" descarta y vuelve a grabar (re-corre el pipeline
// pago; por eso es secundaria). Las ambiguas SIEMPRE se muestran para asignar.

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { ConfirmationPayload } from "@/lib/ai/map-mentions";
import type { ConfirmDelta, MentionSentiment } from "@/lib/ai/confirm-mentions";

export type RosterKid = { student_id: string; student_name: string };

const SENTIMENT_META: Record<
  MentionSentiment,
  { icon: string; label: string }
> = {
  positive: { icon: "✅", label: "Positivo" },
  concern: { icon: "⚠️", label: "Preocupación" },
  negative: { icon: "❌", label: "Negativo" },
  neutral: { icon: "➖", label: "Neutral" },
};

const SENTIMENT_ORDER: MentionSentiment[] = [
  "positive",
  "neutral",
  "concern",
  "negative",
];

type MentionState = {
  studentId: string;
  sentiment: MentionSentiment;
  discarded: boolean;
};

export function ConfirmationModal({
  open,
  onOpenChange,
  observationId,
  payload,
  roster,
  onConfirmed,
  onRerecord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  observationId: string;
  payload: ConfirmationPayload;
  roster: RosterKid[];
  onConfirmed: (mentionCount: number) => void;
  onRerecord: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mentionState, setMentionState] = useState<Record<number, MentionState>>(
    {}
  );
  const [ambiguousState, setAmbiguousState] = useState<
    Record<number, string | null>
  >({});

  // Sembrar el estado desde el payload en la transición false→true (patrón
  // recomendado de React durante render; evita un effect). Reset de editMode.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEditMode(false);
      setSubmitting(false);
      setMentionState(
        Object.fromEntries(
          payload.mentions.map((m) => [
            m.idx,
            { studentId: m.student_id, sentiment: m.sentiment, discarded: false },
          ])
        )
      );
      setAmbiguousState(
        Object.fromEntries(payload.ambiguous.map((a) => [a.idx, null]))
      );
    }
  }

  // Nombre a mostrar para un student_id (busca en roster; cae al payload).
  const nameFor = (studentId: string): string => {
    const inRoster = roster.find((r) => r.student_id === studentId);
    if (inRoster) return inRoster.student_name;
    const inPayload = payload.mentions.find((m) => m.student_id === studentId);
    return inPayload?.student_name ?? "—";
  };

  function buildDelta(): ConfirmDelta {
    return {
      mentions: payload.mentions.map((m) => {
        const s = mentionState[m.idx];
        if (!s || s.discarded) return { idx: m.idx, action: "discard" as const };
        const changed =
          s.studentId !== m.student_id || s.sentiment !== m.sentiment;
        if (changed) {
          return {
            idx: m.idx,
            action: "edit" as const,
            student_id: s.studentId,
            sentiment: s.sentiment,
          };
        }
        return { idx: m.idx, action: "keep" as const };
      }),
      ambiguous: payload.ambiguous.map((a) => ({
        idx: a.idx,
        student_id: ambiguousState[a.idx] ?? null,
      })),
    };
  }

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/observations/${observationId}/confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDelta()),
      });
      const json = (await res.json().catch(() => ({}))) as {
        mentionCount?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? `Error ${res.status}`);
        setSubmitting(false);
        return;
      }
      toast.success("Observación confirmada");
      onConfirmed(json.mentionCount ?? 0);
    } catch {
      toast.error("Error de red al confirmar");
      setSubmitting(false);
    }
  }

  const kept = payload.mentions.filter(
    (m) => !mentionState[m.idx]?.discarded
  ).length;
  const assignedAmbiguous = payload.ambiguous.filter(
    (a) => ambiguousState[a.idx]
  ).length;
  const willConfirm = kept + assignedAmbiguous;
  const isEmpty =
    payload.mentions.length === 0 && payload.ambiguous.length === 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={!submitting}>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden">
          <DrawerHeader>
            <DrawerTitle>Esto entendí (revisá rápido)</DrawerTitle>
            <DrawerDescription>
              {isEmpty
                ? "No detecté menciones individuales."
                : `${willConfirm} ${
                    willConfirm === 1 ? "mención irá" : "menciones irán"
                  } al perfil`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-2">
            {/* Menciones detectadas */}
            {payload.mentions.map((m) => {
              const s = mentionState[m.idx];
              if (!s) return null;
              const meta = SENTIMENT_META[s.sentiment];
              return (
                <div
                  key={`m-${m.idx}`}
                  className={cn(
                    "rounded-xl border border-gray-200 p-3",
                    s.discarded && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span aria-hidden className="text-lg leading-none">
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-semibold text-foreground",
                          s.discarded && "line-through"
                        )}
                      >
                        {nameFor(s.studentId)}
                        <span className="ml-1.5 font-normal text-[color:var(--portesco-gray-mid)]">
                          · {meta.label}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-[color:var(--portesco-gray-mid)]">
                        {m.snippet}
                      </p>
                    </div>
                  </div>

                  {/* Controles de corrección (solo en modo Corregir) */}
                  {editMode && (
                    <div className="mt-3 space-y-2 border-t border-dashed border-gray-200 pt-3">
                      <label className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 font-medium text-[color:var(--portesco-gray-mid)]">
                          Estudiante
                        </span>
                        <select
                          value={s.studentId}
                          disabled={s.discarded}
                          onChange={(e) =>
                            setMentionState((prev) => ({
                              ...prev,
                              [m.idx]: { ...s, studentId: e.target.value },
                            }))
                          }
                          className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
                        >
                          {roster.map((r) => (
                            <option key={r.student_id} value={r.student_id}>
                              {r.student_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 font-medium text-[color:var(--portesco-gray-mid)]">
                          Tono
                        </span>
                        <select
                          value={s.sentiment}
                          disabled={s.discarded}
                          onChange={(e) =>
                            setMentionState((prev) => ({
                              ...prev,
                              [m.idx]: {
                                ...s,
                                sentiment: e.target.value as MentionSentiment,
                              },
                            }))
                          }
                          className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
                        >
                          {SENTIMENT_ORDER.map((sv) => (
                            <option key={sv} value={sv}>
                              {SENTIMENT_META[sv].icon} {SENTIMENT_META[sv].label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-full text-xs"
                        onClick={() =>
                          setMentionState((prev) => ({
                            ...prev,
                            [m.idx]: { ...s, discarded: !s.discarded },
                          }))
                        }
                      >
                        {s.discarded ? "Incluir de nuevo" : "Descartar mención"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Menciones ambiguas — asignar a un kid o descartar */}
            {payload.ambiguous.map((a) => (
              <div
                key={`a-${a.idx}`}
                className="rounded-xl border border-amber-200 bg-amber-50/60 p-3"
              >
                <p className="text-sm font-medium text-foreground">
                  <span aria-hidden className="mr-1">
                    ❓
                  </span>
                  Mención sin nombre claro
                </p>
                <p className="mt-0.5 text-sm text-[color:var(--portesco-gray-mid)]">
                  “{a.description}”
                </p>
                <div className="mt-2 space-y-1.5">
                  {a.candidates.map((c) => (
                    <label
                      key={c.student_id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={`ambiguous-${a.idx}`}
                        checked={ambiguousState[a.idx] === c.student_id}
                        onChange={() =>
                          setAmbiguousState((prev) => ({
                            ...prev,
                            [a.idx]: c.student_id,
                          }))
                        }
                      />
                      {c.student_name}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-[color:var(--portesco-gray-mid)]">
                    <input
                      type="radio"
                      name={`ambiguous-${a.idx}`}
                      checked={!ambiguousState[a.idx]}
                      onChange={() =>
                        setAmbiguousState((prev) => ({ ...prev, [a.idx]: null }))
                      }
                    />
                    Ninguno (descartar)
                  </label>
                </div>
              </div>
            ))}

            {payload.general_notes.trim() && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-[color:var(--portesco-gray-mid)]">
                Nota general: {payload.general_notes}
              </p>
            )}
          </div>

          <DrawerFooter>
            <Button
              type="button"
              size="lg"
              disabled={submitting}
              onClick={confirm}
              className="h-14 text-base font-semibold"
              style={{ backgroundColor: "var(--portesco-blue)" }}
            >
              {submitting
                ? "Confirmando…"
                : isEmpty
                  ? "Confirmar sin menciones"
                  : "Confirmar"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={onRerecord}
              >
                🎤 Re-grabar
              </Button>
              {!isEmpty && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  aria-pressed={editMode}
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? "Listo" : "✏️ Corregir"}
                </Button>
              )}
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
