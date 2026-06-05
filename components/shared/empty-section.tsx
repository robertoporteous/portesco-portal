import type { LucideIcon } from "lucide-react";

// Reusable placeholder for dashboard sections that exist but aren't wired yet
// (COLA / REPORTES / ALERTAS in Bloque 2). Icon + title + "Disponible pronto".
// NO mock data — this is the honest empty state until the real section ships.
export function EmptySection({
  icon: Icon,
  title,
  subtitle = "Disponible pronto",
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
      <Icon
        className="size-6 text-[color:var(--portesco-gray-mid)]"
        aria-hidden
      />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-[color:var(--portesco-gray-mid)]">{subtitle}</p>
    </div>
  );
}
