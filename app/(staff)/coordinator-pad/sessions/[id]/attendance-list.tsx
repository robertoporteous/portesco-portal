"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AttendanceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  closeClass,
  markAttendance,
  type MarkableStatus,
} from "../../actions";
import { EventualityDrawer } from "./eventuality-drawer";

export type Kid = {
  id: string;
  fullName: string;
  status: AttendanceStatus | null;
  eventualities: number;
};

type Group = { category: string; kids: Kid[] };

const OPTIONS: { value: MarkableStatus; label: string; activeClass: string }[] = [
  { value: "present", label: "Presente", activeClass: "bg-emerald-600 text-white" },
  { value: "absent", label: "Ausente", activeClass: "bg-red-600 text-white" },
  { value: "justified", label: "Justificado", activeClass: "bg-amber-500 text-white" },
];

function isMarked(status: AttendanceStatus | null): boolean {
  return status !== null && status !== "not_marked";
}

export function AttendanceList({
  sessionId,
  activityName,
  headerDate,
  headerTime,
  totalKids,
  groups,
  initiallyClosed,
}: {
  sessionId: string;
  activityName: string;
  headerDate: string;
  headerTime: string;
  totalKids: number;
  groups: Group[];
  initiallyClosed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [closed, setClosed] = useState(initiallyClosed);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Source of truth for the rendered status of every kid (optimistic).
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | null>>(
    () => Object.fromEntries(groups.flatMap((g) => g.kids).map((k) => [k.id, k.status]))
  );

  // Eventuality counts per kid (for the badge) + which kid's drawer is open.
  const [eventCounts, setEventCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.kids).map((k) => [k.id, k.eventualities]))
  );
  const [drawerKid, setDrawerKid] = useState<{ id: string; fullName: string } | null>(
    null
  );

  const markedCount = Object.values(statuses).filter(isMarked).length;
  const remaining = totalKids - markedCount;

  function mark(studentId: string, status: MarkableStatus) {
    if (closed) return;
    const previous = statuses[studentId] ?? null;
    setStatuses((s) => ({ ...s, [studentId]: status })); // optimistic
    startTransition(async () => {
      const result = await markAttendance({ sessionId, studentId, status });
      if (!result.ok) {
        setStatuses((s) => ({ ...s, [studentId]: previous })); // revert
        toast.error("No se pudo guardar la asistencia");
      }
    });
  }

  function doClose() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await closeClass(sessionId);
      if (!result.ok) {
        toast.error("No se pudo cerrar la clase");
        return;
      }
      setClosed(true);
      toast.success("Clase cerrada");
      router.push("/coordinator-pad");
    });
  }

  function onCloseClick() {
    if (remaining > 0) {
      setConfirmOpen(true);
    } else {
      doClose();
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col">
      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">
              {activityName}
            </h1>
            {closed && <Badge variant="secondary">Cerrada</Badge>}
          </div>
          <p className="text-xs text-[color:var(--portesco-gray-mid)]">
            {headerDate} · {headerTime} · {totalKids} inscritos
          </p>
        </div>

        {/* Grouped roster */}
        {groups.map((group) => (
          <div key={group.category} className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--portesco-gray-mid)]">
              {group.category} · {group.kids.length}
            </p>
            {group.kids.map((kid) => (
              <div
                key={kid.id}
                className="rounded-lg border border-gray-100 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {kid.fullName}
                  </p>
                  {/* Eventuality trigger — allowed even on a closed class
                      (late-reported injuries/incidents must not be blocked). */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Registrar eventualidad de ${kid.fullName}`}
                    onClick={() =>
                      setDrawerKid({ id: kid.id, fullName: kid.fullName })
                    }
                    className="relative shrink-0"
                  >
                    <TriangleAlert className="size-4 text-[color:var(--portesco-gray-mid)]" />
                    {(eventCounts[kid.id] ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white">
                        {eventCounts[kid.id]}
                      </span>
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {OPTIONS.map((opt) => {
                    const active = statuses[kid.id] === opt.value;
                    return (
                      <Button
                        key={opt.value}
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={closed || isPending}
                        aria-pressed={active}
                        onClick={() => mark(kid.id, opt.value)}
                        className={cn("h-10", active && opt.activeClass)}
                      >
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Sticky bottom — soft close */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-3">
        <Button
          className="w-full"
          size="lg"
          disabled={closed || isPending}
          onClick={onCloseClick}
        >
          {closed
            ? "Clase cerrada"
            : `Cerrar clase (${markedCount}/${totalKids})`}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Faltan {remaining} por marcar
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Querés cerrar la clase igual? Podés volver y completar la
              asistencia primero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={doClose}>Cerrar igual</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EventualityDrawer
        open={drawerKid !== null}
        onOpenChange={(o) => {
          if (!o) setDrawerKid(null);
        }}
        kid={drawerKid}
        sessionId={sessionId}
        onSaved={(studentId) =>
          setEventCounts((c) => ({ ...c, [studentId]: (c[studentId] ?? 0) + 1 }))
        }
      />
    </div>
  );
}
