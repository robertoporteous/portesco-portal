import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/shared/logout-button";
import { CopyButton } from "@/components/shared/copy-button";

// Perfil (Sprint 4 T5): datos del padre, hijos con colegio y grado, y la
// sección Pago por colegio (yappy_handle + bank_account vienen de schools,
// visibles al padre por la policy "schools: members see schools they belong
// to" de 0004). Regla de negocio: pago hasta el 10 de cada mes (brain file).

type SchoolRow = { id: string; name: string; yappy_handle: string; bank_account: string | null; contact_phone: string | null };
type StudentRow = { id: string; full_name: string; grade: string; school_id: string };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileResult, studentsResult, schoolsResult] = await Promise.all([
    supabase.from("users").select("full_name, email, phone").eq("id", user.id).maybeSingle(),
    supabase.from("students").select("id, full_name, grade, school_id").eq("is_active", true).order("full_name"),
    supabase.from("schools").select("id, name, yappy_handle, bank_account, contact_phone").order("name"),
  ]);

  const profile = profileResult.data;
  const students = (studentsResult.data ?? []) as StudentRow[];
  const kidSchoolIds = new Set(students.map((s) => s.school_id));
  const schools = ((schoolsResult.data ?? []) as SchoolRow[]).filter((s) => kidSchoolIds.has(s.id));
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
        Perfil
      </h1>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
        <p className="text-base font-semibold text-gray-900">{profile?.full_name ?? "—"}</p>
        <p className="text-sm text-gray-700">{profile?.email ?? user.email}</p>
        {profile?.phone && <p className="text-sm text-gray-700">{profile.phone}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--portesco-gray-mid)" }}>
          Mis hijos
        </h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {students.length === 0 ? (
            <p className="p-4 text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
              Aún no tienes estudiantes registrados.
            </p>
          ) : (
            students.map((s) => (
              <div key={s.id} className="px-4 py-3 flex flex-col">
                <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
                  {s.grade} · {schoolName.get(s.school_id) ?? "—"}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section id="pago" className="flex flex-col gap-2 scroll-mt-16">
        <h2 className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--portesco-gray-mid)" }}>
          Pago
        </h2>
        {schools.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>—</p>
        ) : (
          schools.map((sc) => (
            <div key={sc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
              {schools.length > 1 && (
                <p className="text-sm font-semibold text-gray-900">{sc.name}</p>
              )}
              <p className="text-sm text-gray-700">
                La mensualidad se paga <span className="font-medium">hasta el 10 de cada mes</span>.
              </p>

              <div className="rounded-xl bg-gray-50 p-3 flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--portesco-gray-mid)" }}>
                    Yappy
                  </span>
                  <span className="text-base font-semibold text-gray-900 truncate">{sc.yappy_handle}</span>
                </div>
                <CopyButton value={sc.yappy_handle} label="Copiar" />
              </div>

              {sc.bank_account && (
                <div className="rounded-xl bg-gray-50 p-3 flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--portesco-gray-mid)" }}>
                      Transferencia bancaria
                    </span>
                    <span className="text-sm text-gray-900 whitespace-pre-line">{sc.bank_account}</span>
                  </div>
                  <CopyButton value={sc.bank_account} label="Copiar" />
                </div>
              )}

              <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
                Al pagar, escribe el nombre de tu hijo en la descripción.
                {sc.contact_phone ? ` Dudas: ${sc.contact_phone}.` : ""}
              </p>
            </div>
          ))
        )}
      </section>

      <section className="pt-2">
        <LogoutButton className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700" />
      </section>
    </div>
  );
}
