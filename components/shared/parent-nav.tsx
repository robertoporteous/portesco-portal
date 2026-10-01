"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, CalendarDays, Newspaper, User } from "lucide-react";

// Bottom nav del padre (Sprint 4 T5). Cliente solo por usePathname (estado activo).
const ITEMS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/progress", label: "Avance", icon: BarChart3 },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/news", label: "Noticias", icon: Newspaper },
  { href: "/profile", label: "Perfil", icon: User },
] as const;

export function ParentNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 flex items-stretch justify-around px-2"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium"
            style={{ color: active ? "var(--portesco-blue)" : "var(--portesco-gray-mid)" }}
          >
            <Icon className="size-5" aria-hidden strokeWidth={active ? 2.5 : 2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
