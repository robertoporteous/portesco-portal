import { LogoutButton } from "@/components/shared/logout-button";

// Parent portal layout with header (logout) + bottom navigation.
export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 bg-white border-b border-gray-100"
        style={{ color: "var(--portesco-blue)" }}
      >
        <p className="text-sm font-semibold">PORTESCO</p>
        <LogoutButton className="text-xs font-medium text-[color:var(--portesco-gray-mid)] hover:text-[color:var(--portesco-blue)] disabled:opacity-50" />
      </header>
      <main className="flex-1 pb-20">{children}</main>
      {/* Bottom navigation — Sprint 2 */}
      <nav
        className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 flex items-center justify-around px-4"
        style={{ color: "var(--portesco-blue)" }}
      >
        <span className="text-xs">Inicio</span>
        <span className="text-xs">Avance</span>
        <span className="text-xs">Calendario</span>
        <span className="text-xs">Noticias</span>
        <span className="text-xs">Perfil</span>
      </nav>
    </div>
  );
}
