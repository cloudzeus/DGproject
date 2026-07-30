/**
 * Skeleton αντί για spinner.
 *
 * Οι σελίδες του portal είναι `force-dynamic` και κάνουν αρκετά queries· ένα
 * κενό λευκό διάστημα ή ένα γυρίζον spinner κάνει την αναμονή να μοιάζει
 * μεγαλύτερη. Το skeleton κρατά το σχήμα της σελίδας, οπότε δεν υπάρχει και
 * layout shift όταν έρθουν τα δεδομένα.
 */
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded bg-fluent-neutral-8 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.7)_50%,transparent_100%)] bg-[length:200%_100%] ${className}`}
      aria-hidden
    />
  );
}

export default function PortalLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Φόρτωση">
      <div>
        <Shimmer className="h-3 w-24" />
        <Shimmer className="mt-2 h-8 w-64" />
        <Shimmer className="mt-2 h-3 w-48" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-fluent-neutral-10 bg-white p-4 shadow-fluent-2"
          >
            <Shimmer className="h-2.5 w-16" />
            <Shimmer className="mt-2.5 h-8 w-14" />
            <Shimmer className="mt-2 h-2.5 w-20" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-fluent-neutral-10 bg-white p-5 shadow-fluent-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Shimmer className="h-4 w-40" />
                <Shimmer className="mt-2 h-2.5 w-16" />
              </div>
              <Shimmer className="h-7 w-12" />
            </div>
            <Shimmer className="mt-4 h-2 w-full rounded-full" />
            <div className="mt-3 flex gap-3">
              <Shimmer className="h-2.5 w-20" />
              <Shimmer className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Φόρτωση περιεχομένου…</span>
    </div>
  );
}
