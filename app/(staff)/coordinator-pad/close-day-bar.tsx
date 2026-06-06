"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { closeDay } from "./actions";

export function CloseDayBar({
  total,
  closed,
  openCount,
  anyOpenIncomplete,
}: {
  total: number;
  closed: number;
  openCount: number;
  anyOpenIncomplete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const noSessions = total === 0;
  const allClosed = total > 0 && closed === total;
  const disabled = noSessions || allClosed || isPending;

  function doCloseDay() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await closeDay();
      if (!result.ok) {
        toast.error("No se pudo cerrar el día");
        return;
      }
      toast.success("Día cerrado");
      router.refresh();
    });
  }

  const label = allClosed
    ? "Día cerrado"
    : `Cerrar día (${closed}/${total} clases)`;

  return (
    <div className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-3">
      <Button
        className="w-full"
        size="lg"
        disabled={disabled}
        onClick={() => setConfirmOpen(true)}
      >
        {label}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {openCount === 1
                ? "Tenés 1 clase sin cerrar"
                : `Tenés ${openCount} clases sin cerrar`}
              {anyOpenIncomplete ? " y asistencia incompleta" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Querés cerrar el día igual? Se cerrarán todas las clases de hoy
              que sigan abiertas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={doCloseDay}>
              Cerrar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
