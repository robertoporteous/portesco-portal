import { LogoutButton } from "@/components/shared/logout-button";
import { AdminNav } from "@/components/admin/admin-nav";

// Admin layout: sticky header (mobile + desktop) + desktop-only sidebar.
// Mobile: fila de chips bajo el header (Sprint 4 T9).
export default function AdminLayout({
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
        <p className="text-sm font-semibold">PORTESCO Admin</p>
        <LogoutButton className="text-xs font-medium text-[color:var(--portesco-gray-mid)] hover:text-[color:var(--portesco-blue)] disabled:opacity-50" />
      </header>
      <AdminNav variant="mobile" />
      <div className="flex flex-1">
        <aside
          className="w-64 hidden md:flex flex-col border-r border-gray-100 px-4 py-6"
          style={{ backgroundColor: "var(--portesco-blue)", color: "white" }}
        >
          <p className="text-sm font-semibold mb-6">PORTESCO Admin</p>
          <AdminNav variant="sidebar" />
        </aside>
        <main className="flex-1 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
