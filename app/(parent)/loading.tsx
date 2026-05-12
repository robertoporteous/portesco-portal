export default function ParentLoading() {
  return (
    <div className="px-4 py-6 flex flex-col gap-5 animate-pulse">
      <div className="h-7 w-32 rounded bg-gray-200" />
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <div className="w-12 h-12 rounded-full bg-gray-200" />
          <div className="flex flex-col gap-2">
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-3 w-16 rounded bg-gray-100" />
          </div>
        </div>
        <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-3">
          <div className="h-3 w-24 rounded bg-gray-100" />
          <div className="h-4 w-3/4 rounded bg-gray-200" />
          <div className="h-4 w-2/3 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
