import { auth } from '@/auth'
import { getPortalScope } from '@/lib/portal/scope'
import { listSharedMeetings } from '@/lib/portal/meetings'
import { PortalMeetingCard } from '@/components/portal/meeting-card'

export const dynamic = 'force-dynamic'

/**
 * Τα δημοσιευμένα πρακτικά όλων των έργων του πελάτη.
 *
 * Το φιλτράρισμα ζει ολόκληρο στο `listSharedMeetings`. Η σελίδα δεν ξέρει τι
 * σημαίνει «δημοσιευμένο» — και αυτό είναι σκόπιμο: αν η έννοια αλλάξει,
 * αλλάζει σε ένα σημείο.
 */
export default async function PortalMeetingsPage() {
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  const meetings = await listSharedMeetings(scope)

  // Ομαδοποίηση ανά μήνα: οι συσκέψεις είναι αραιά γεγονότα, οπότε η χρονική
  // απόσταση μεταξύ τους είναι πληροφορία — μια ενιαία λίστα την κρύβει.
  const groups = new Map<string, typeof meetings>()
  for (const m of meetings) {
    const key = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(
      new Date(m.startedAt),
    )
    const bucket = groups.get(key)
    if (bucket) bucket.push(m)
    else groups.set(key, [m])
  }

  return (
    <div className="space-y-6">
      <header className="animate-fade-in">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
          Πύλη πελατών
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-fluent-neutral-90 sm:text-2xl">
          Πρακτικά συσκέψεων
        </h1>
        <p className="mt-1.5 text-sm text-fluent-neutral-70">
          {meetings.length > 0
            ? `${meetings.length} ${meetings.length === 1 ? 'σύσκεψη' : 'συσκέψεις'} με δημοσιευμένα πρακτικά.`
            : 'Εδώ θα βρίσκετε τα πρακτικά των συσκέψεών μας.'}
        </p>
      </header>

      {meetings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-fluent-neutral-80">
            Δεν υπάρχουν δημοσιευμένα πρακτικά
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-fluent-neutral-60">
            Μετά από κάθε σύσκεψη, η ομάδα ελέγχει τα πρακτικά και δημοσιεύει εδώ όσα σας
            αφορούν — αποφάσεις, ενέργειες και ανοιχτά ερωτήματα.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([month, rows]) => (
            <section key={month}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                {month}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((m) => (
                  <PortalMeetingCard key={m.id} meeting={m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
