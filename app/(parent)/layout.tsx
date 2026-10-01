import { LogoutButton } from "@/components/shared/logout-button";
import { ParentNav } from "@/components/shared/parent-nav";

// Parent portal layout with header (logout) + bottom navigation (Sprint 4 T5:
// links reales a las 5 pantallas, con estado activo).
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
      <main className="flex-1 pb-24">{children}</main>
      <ParentNav />
    </div>
  );
}
