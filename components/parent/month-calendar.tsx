"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Grilla mensual compacta (Sprint 4 T7). Cliente solo por: mes visible y día
// seleccionado. Recibe los items ya resueltos por el Server Component (fechas
// como ISO, nada de queries aquí). Cada celda muestra hasta 2 etiquetas cortas
// + "+N"; tocar un día lista sus items debajo de la grilla.

export type CalItem = {
  key: string;
  dayKey: string;      // "YYYY-MM-DD" en Panamá
  startIso: string;
  endIso: string | null;
  time: string;        // "2:30 PM"
  endTime: string | null;
  title: string;
  short: string;       // etiqueta para la celda (≤ 14 chars)
  subtitle: string | null;
  location: string | null;
  kindLabel: string;
  color: string;
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DOW = ["L", "M", "M", "J", "V", "S", "D"];

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function MonthCalendar({
  items,
  todayKey,
  minMonth,
  maxMonth,
}: {
  items: CalItem[];
  todayKey: string;          // "YYYY-MM-DD"
  minMonth: string;          // "YYYY-MM" (primer mes con datos cargados)
  maxMonth: string;          // "YYYY-MM" (último mes con datos cargados)
}) {
  const [ty, tm] = todayKey.split("-").map(Number);
  const [view, setView] = useState<{ y: number; m: number }>({ y: ty, m: tm - 1 });
  const [selected, setSelected] = useState<string>(todayKey);

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) m.set(it.dayKey, [...(m.get(it.dayKey) ?? []), it]);
    return m;
  }, [items]);

  const viewKey = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
  const canPrev = viewKey > minMonth;
  const canNext = viewKey < maxMonth;

  // Celdas: lunes como primer día (ISO). getDay(): 0=domingo.
  const first = new Date(Date.UTC(view.y, view.m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedItems = byDay.get(selected) ?? [];
  const selectedDate = (() => {
    const [y, m, d] = selected.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  })();

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={!canPrev}
          onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
          className="p-2 rounded-full disabled:opacity-30"
          style={{ color: "var(--portesco-blue)" }}
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="text-sm font-semibold text-gray-900 capitalize">
          {MONTHS[view.m]} {view.y}
        </p>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={!canNext}
          onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
          className="p-2 rounded-full disabled:opacity-30"
          style={{ color: "var(--portesco-blue)" }}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide px-1 pt-2" style={{ color: "var(--portesco-gray-mid)" }}>
        {DOW.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 border-t border-gray-100 mt-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e-${i}`} className="bg-gray-50 min-h-[64px]" />;
          const key = ymd(view.y, view.m, d);
          const dayItems = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSel = key === selected;
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelected(key)}
              aria-label={`${d} de ${MONTHS[view.m]}${dayItems.length ? `, ${dayItems.length} eventos` : ""}`}
              aria-pressed={isSel}
              className="bg-white min-h-[64px] p-1 flex flex-col items-stretch text-left"
              style={isSel ? { boxShadow: "inset 0 0 0 2px var(--portesco-blue)" } : undefined}
            >
              <span
                className="self-start text-[11px] leading-none w-5 h-5 rounded-full flex items-center justify-center font-medium"
                style={
                  isToday
                    ? { backgroundColor: "var(--portesco-red)", color: "white" }
                    : { color: "#111827" }
                }
              >
                {d}
              </span>
              <span className="mt-0.5 flex flex-col gap-px overflow-hidden">
                {dayItems.slice(0, 2).map((it) => (
                  <span
                    key={it.key}
                    className="text-[9px] leading-[11px] truncate rounded-sm px-0.5 text-white"
                    style={{ backgroundColor: it.color }}
                  >
                    {it.short}
                  </span>
                ))}
                {dayItems.length > 2 && (
                  <span className="text-[9px] leading-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>
                    +{dayItems.length - 2}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-xs font-semibold text-gray-900">
          {selected === todayKey ? "Hoy · " : ""}
          {new Intl.DateTimeFormat("es-PA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(selectedDate)}
        </p>
        {selectedItems.length === 0 ? (
          <p className="text-sm mt-1" style={{ color: "var(--portesco-gray-mid)" }}>
            Sin prácticas ni eventos.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {selectedItems.map((it) => (
              <li key={it.key} className="flex items-stretch gap-3">
                <span aria-hidden className="w-1 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                <div className="flex flex-col min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-snug">{it.title}</p>
                  <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
                    {it.kindLabel} · {it.time}
                    {it.endTime ? `–${it.endTime}` : ""}
                    {it.subtitle ? ` · ${it.subtitle}` : ""}
                    {it.location ? ` · ${it.location}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
