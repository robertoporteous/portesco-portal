import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/parent-attendance";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { ActivityCategory } from "@/lib/types";

// Catálogo del colegio (Sprint 4 T8) — eje "mi colegio". Todas las actividades
// ACTIVAS del colegio de sus hijos (policy "activities: parent sees active
// catalog of kids' schools", 0010), con horario, precio y cupos. Las que ya
// tienen a un hijo inscrito llevan badge. CTA "Quiero inscribir" abre WhatsApp
// con la coordinación del colegio (schools.coordination_phone) y un mensaje
// pre-escrito. Sin escritura: la inscripción sigue siendo humana (Sprint 5+).

type SchoolRow = { id: string; name: string; coordination_phone: string | null; contact_phone: string | null };
type ActivityRow = {
  id: string; school_id: string; name: string; category: ActivityCategory;
  monthly_price: number; schedule: string | null; min_students: number; max_students: number | null;
};
type Student = { id: string; full_name: string; school_id: string; enrollments: { activities: { id: string } | { id: string }[] }[] };

const CATEGORY_COLOR: Record<ActivityCategory, string> = {
  deporte: "#16A34A", arte: "#9333EA", academico: "#1E3A8A", cuidado: "#EA580C",
};

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function price(n: number): string {
  return n > 0 ? `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}/mes` : "Consultar";
}

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [studentsR, schoolsR, activitiesR] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, school_id, enrollments ( activities ( id ) )")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("schools").select("id, name, coordination_phone, contact_phone").order("name"),
    supabase
      .from("activities")
      .select("id, school_id, name, category, monthly_price, schedule, min_students, max_students")
      .eq("is_active", true)
      .order("category")
      .order("name"),
  ]);
  if (activitiesR.error) throw new Error(activitiesR.error.message);

  const students = (studentsR.data ?? []) as Student[];
  const kidSchoolIds = new Set(students.map((s) => s.school_id));
  const schools = ((schoolsR.data ?? []) as SchoolRow[]).filter((s) => kidSchoolIds.has(s.id));
  const activities = ((activitiesR.data ?? []) as ActivityRow[]).filter((a) => kidSchoolIds.has(a.school_id));

  // activity_id → nombres de hijos inscritos
  const enrolledKids = new Map<string, string[]>();
  for (const s of students) {
    for (const e of s.enrollments) {
      for (const a of rel(e.activities)) {
        enrolledKids.set(a.id, [...(enrolledKids.get(a.id) ?? []), s.full_name.split(" ")[0]]);
      }
    }
  }
  const kidNames = students.map((s) => s.full_name.split(" ")[0]);

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
          Actividades
        </h1>
        <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
          Todo lo que ofrece {schools.length === 1 ? schools[0].name : "tu colegio"} este periodo.
        </p>
      </div>

      {schools.map((sc) => {
        const list = activities.filter((a) => a.school_id === sc.id);
        const byCat = new Map<ActivityCategory, ActivityRow[]>();
        for (const a of list) byCat.set(a.category, [...(byCat.get(a.category) ?? []), a]);
        const phone = sc.coordination_phone ?? sc.contact_phone;

        return (
          <section key={sc.id} className="flex flex-col gap-4">
            {schools.length > 1 && (
              <h2 className="text-base font-semibold text-gray-900">{sc.name}</h2>
            )}
            {list.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--portesco-gray-mid)" }}>
                Sin actividades activas por ahora.
              </p>
            ) : (
              Array.from(byCat.entries()).map(([cat, items]) => (
                <div key={cat} className="flex flex-col gap-2">
                  <h3 className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--portesco-gray-mid)" }}>
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {items.map((a) => {
                      const kids = enrolledKids.get(a.id) ?? [];
                      const notEnrolled = kidNames.filter((k) => !kids.includes(k));
                      const who = (notEnrolled.length ? notEnrolled : kidNames).join(" y ");
                      const msg = `Hola, soy acudiente de ${who} en ${sc.name}. Quiero información para inscribir en ${a.name}.`;
                      const link = waLink(phone, msg);
                      return (
                        <li key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                          <div className="flex items-stretch gap-3 p-4">
                            <span aria-hidden className="w-1 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLOR[a.category] }} />
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-base font-semibold text-gray-900 leading-snug">{a.name}</p>
                                <p className="text-sm font-medium shrink-0" style={{ color: "var(--portesco-blue)" }}>
                                  {price(a.monthly_price)}
                                </p>
                              </div>
                              {a.schedule && (
                                <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>{a.schedule}</p>
                              )}
                              {(a.max_students || a.min_students > 0) && (
                                <p className="text-[11px]" style={{ color: "var(--portesco-gray-mid)" }}>
                                  {a.max_students ? `Cupo máximo ${a.max_students}` : `Mínimo ${a.min_students} para abrir`}
                                </p>
                              )}
                              <div className="flex items-center justify-between gap-2 pt-1">
                                {kids.length > 0 ? (
                                  <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-emerald-100 text-emerald-800">
                                    {kids.length > 1 ? "Inscritos" : "Inscrito"}: {kids.join(" y ")}
                                  </span>
                                ) : (
                                  <span />
                                )}
                                {link && notEnrolled.length > 0 && (
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold rounded-full px-3 py-1.5 text-white shrink-0"
                                    style={{ backgroundColor: "var(--portesco-red)" }}
                                  >
                                    Quiero inscribir
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
            {!phone && (
              <p className="text-xs" style={{ color: "var(--portesco-gray-mid)" }}>
                Para inscribir, habla con la coordinación del colegio.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
