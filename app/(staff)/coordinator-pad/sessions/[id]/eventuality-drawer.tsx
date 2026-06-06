"use client";

import { useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addEventuality,
  type EventualitySeverity,
  type EventualityType,
} from "../../actions";

const TYPE_OPTIONS: { value: EventualityType; label: string }[] = [
  { value: "lesion", label: "Lesión" },
  { value: "retiro_temprano", label: "Retiro temprano" },
  { value: "conflicto", label: "Conflicto" },
  { value: "comportamiento", label: "Comportamiento" },
  { value: "tarde", label: "Tarde" },
  { value: "otro", label: "Otro" },
];

const SEVERITY_OPTIONS: {
  value: EventualitySeverity;
  label: string;
  activeClass: string;
}[] = [
  { value: "info", label: "Info", activeClass: "bg-slate-600 text-white" },
  { value: "attention", label: "Atención", activeClass: "bg-amber-500 text-white" },
  { value: "urgent", label: "Urgente", activeClass: "bg-red-600 text-white" },
];

const NOTES_MAX = 280;

export function EventualityDrawer({
  open,
  onOpenChange,
  kid,
  sessionId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kid: { id: string; fullName: string } | null;
  sessionId: string;
  onSaved: (studentId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<EventualityType | null>(null);
  const [severity, setSeverity] = useState<EventualitySeverity>("info");
  const [notes, setNotes] = useState("");

  // Reset the form each time the drawer opens — done during render on the
  // open false→true transition (React's recommended pattern; avoids an effect).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setType(null);
      setSeverity("info");
      setNotes("");
    }
  }

  function save() {
    if (!kid || !type) return;
    startTransition(async () => {
      const result = await addEventuality({
        sessionId,
        studentId: kid.id,
        type,
        severity,
        notes: notes || null,
      });
      if (!result.ok) {
        toast.error("No se pudo registrar la eventualidad");
        return;
      }
      toast.success("Eventualidad registrada");
      onSaved(kid.id);
      onOpenChange(false);
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Eventualidad</DrawerTitle>
            <DrawerDescription>{kid?.fullName}</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 px-4">
            {/* Type chips */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
                Tipo
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant="outline"
                    size="lg"
                    aria-pressed={type === opt.value}
                    onClick={() => setType(opt.value)}
                    className={cn(
                      "h-11",
                      type === opt.value &&
                        "border-[color:var(--portesco-blue)] bg-[color:var(--portesco-blue)] text-white"
                    )}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
                Severidad
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITY_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant="outline"
                    size="lg"
                    aria-pressed={severity === opt.value}
                    onClick={() => setSeverity(opt.value)}
                    className={cn("h-10", severity === opt.value && opt.activeClass)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
                Notas
              </p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                maxLength={NOTES_MAX}
                rows={3}
                placeholder="Opcional"
              />
              <p className="text-right text-xs text-[color:var(--portesco-gray-mid)]">
                {notes.length}/{NOTES_MAX}
              </p>
            </div>
          </div>

          <DrawerFooter>
            <Button
              type="button"
              size="lg"
              disabled={!type || isPending}
              onClick={save}
            >
              Guardar
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
