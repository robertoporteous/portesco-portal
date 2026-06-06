import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/sonner";

// Coordinator Pad auth gate — second line of defense (AGENTS.md §3.4, "RLS as
// first line, server action/app as second"). proxy.ts already redirects wrong
// roles at the edge; this re-checks server-side and covers every nested pad
// route (sessions, reports, alerts) added in later Pasos.
//
// Only coordinator + admin enter. Professor has its own surface; parent has none.
export default async function CoordinatorPadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const allowed =
    !!profile &&
    (profile.is_admin ||
      profile.role === "admin" ||
      profile.role === "coordinator");

  if (!allowed) redirect("/");

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
