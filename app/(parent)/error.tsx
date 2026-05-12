"use client";

export default function ParentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col gap-3 items-center text-center">
        <p
          className="text-base font-semibold"
          style={{ color: "var(--portesco-blue)" }}
        >
          No pudimos cargar la información
        </p>
        <p
          className="text-sm"
          style={{ color: "var(--portesco-gray-mid)" }}
        >
          Intenta de nuevo. Si el problema persiste, contacta a tu coordinadora.
        </p>
        <button
          type="button"
          onClick={reset}
          className="h-10 px-4 rounded-xl text-white text-sm font-medium"
          style={{ backgroundColor: "var(--portesco-red)" }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
