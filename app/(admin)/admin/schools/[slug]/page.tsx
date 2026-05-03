// Single school detail — Sprint 4
export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-semibold" style={{ color: "var(--portesco-blue)" }}>
        Colegio: {slug}
      </h1>
      <p className="text-sm mt-2" style={{ color: "var(--portesco-gray-mid)" }}>
        Próximamente: actividades, inscripciones, asistencia y estado de reportes.
      </p>
    </div>
  );
}
