// Supabase server client — configured in Sprint 1 (Supabase setup)
// Import: import { createClient } from "@/lib/supabase/server"

// TODO: install @supabase/supabase-js and @supabase/ssr, then uncomment:
// import { createServerClient } from "@supabase/ssr";
// import { cookies } from "next/headers";
//
// export async function createClient() {
//   const cookieStore = await cookies();
//   return createServerClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//     {
//       cookies: {
//         getAll() { return cookieStore.getAll(); },
//         setAll(cookiesToSet) {
//           cookiesToSet.forEach(({ name, value, options }) =>
//             cookieStore.set(name, value, options)
//           );
//         },
//       },
//     }
//   );
// }

export {};
