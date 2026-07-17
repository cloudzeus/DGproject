export default function ReportsLoading() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-pulse">
      <div className="h-8 w-44 bg-fluent-neutral-8 rounded mb-2" />
      <div className="h-4 w-72 bg-fluent-neutral-6 rounded mb-6" />
      <div className="h-9 w-full max-w-md bg-fluent-neutral-6 rounded mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
            <div className="h-3 w-20 bg-fluent-neutral-8 rounded mb-3" />
            <div className="h-8 w-16 bg-fluent-neutral-8 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-64 bg-white rounded-xl border border-black/5 shadow-fluent-2" />
        ))}
      </div>
    </div>
  );
}
