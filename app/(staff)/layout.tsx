import { LogoutButton } from "@/components/shared/logout-button";

// Staff portal layout: sticky header (mobile + desktop) + desktop-only sidebar.
// Mobile drawer for sidebar nav is Sprint 3.
export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 bg-white border-b border-gray-100"
        style={{ color: "var(--portesco-blue)" }}
      >
        <p className="text-sm font-semibold">PORTESCO Staff</p>
        <LogoutButton className="text-xs font-medium text-[color:var(--portesco-gray-mid)] hover:text-[color:var(--portesco-blue)] disabled:opacity-50" />
      </header>
      <div className="flex flex-1">
        <aside
          className="w-60 hidden md:flex flex-col border-r border-gray-100 px-4 py-6"
          style={{ backgroundColor: "var(--portesco-blue)", color: "white" }}
        >
          <p className="text-sm font-semibold mb-6">PORTESCO Staff</p>
          <nav className="flex flex-col gap-2 text-sm flex-1">
            <span>Dashboard</span>
            <span>Asistencia</span>
            <span>Reportes</span>
            <span>Estudiantes</span>
          </nav>
        </aside>
        <main className="flex-1 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
