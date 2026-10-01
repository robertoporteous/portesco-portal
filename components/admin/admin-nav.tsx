"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Navegación admin (Sprint 4 T9): antes eran <span> sin enlace. Desktop en el
// sidebar azul; en móvil una fila horizontal con scroll bajo el header.

const ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/schools", label: "Colegios" },
  { href: "/admin/events", label: "Eventos" },
  { href: "/admin/news", label: "Noticias" },
  { href: "/admin/students", label: "Estudiantes" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/reports", label: "Reportes" },
  { href: "/admin/settings", label: "Configuración" },
];

export function AdminNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  if (variant === "mobile") {
    return (
      <nav className="md:hidden flex gap-1 overflow-x-auto px-3 py-2 bg-white border-b border-gray-100 text-xs">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="shrink-0 rounded-full px-3 py-1.5 font-medium"
            style={
              isActive(it.href)
                ? { backgroundColor: "var(--portesco-blue)", color: "white" }
                : { color: "var(--portesco-gray-mid)" }
            }
          >
            {it.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1 text-sm flex-1">
      {ITEMS.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="rounded-lg px-3 py-2"
          style={isActive(it.href) ? { backgroundColor: "rgba(255,255,255,0.15)", fontWeight: 600 } : undefined}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
