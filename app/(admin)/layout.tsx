// Admin layout with full navigation — Sprint 4
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="w-64 hidden md:flex flex-col border-r border-gray-100 px-4 py-6"
        style={{ backgroundColor: "var(--portesco-blue)", color: "white" }}
      >
        <p className="text-sm font-semibold mb-6">PORTESCO Admin</p>
        <nav className="flex flex-col gap-2 text-sm">
          <span>Dashboard</span>
          <span>Colegios</span>
          <span>Estudiantes</span>
          <span>Staff</span>
          <span>Reportes</span>
          <span>Eventos</span>
          <span>Noticias</span>
          <span>Configuración</span>
        </nav>
      </aside>
      <main className="flex-1 bg-gray-50">{children}</main>
    </div>
  );
}
