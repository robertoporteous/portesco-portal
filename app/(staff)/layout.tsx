import { LogoutButton } from "@/components/shared/logout-button";

// Staff portal layout with sidebar — Sprint 3
export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar — Sprint 3 */}
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
        <LogoutButton />
      </aside>
      <main className="flex-1 bg-gray-50">{children}</main>
    </div>
  );
}
