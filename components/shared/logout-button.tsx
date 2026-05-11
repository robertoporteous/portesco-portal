"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={
        className ??
        "text-xs font-medium text-white/80 hover:text-white disabled:opacity-50"
      }
    >
      {pending ? "Cerrando..." : "Cerrar sesión"}
    </button>
  );
}
