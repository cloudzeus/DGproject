import { auth } from '@/auth'
import { getPortalScope } from '@/lib/portal/scope'
import { listMilestones, type Milestone } from '@/lib/portal/timeline'
import { PortalMilestones } from '@/components/portal/milestones'

export const dynamic = 'force-dynamic'

/**
 * Πλήρες χρονοδιάγραμμα: όλα τα ορόσημα, χωρίς ορίζοντα.
 *
 * Η ομαδοποίηση είναι σε τρεις κουβάδες αντί για μήνες, επειδή αυτό ρωτάει ο
 * πελάτης: τι έχει ξεφύγει, τι τρέχει αυτή τη βδομάδα, τι έρχεται. Οι μήνες
 * είναι σωστό ημερολόγιο και λάθος απάντηση.
 */
function bucketOf(m: Milestone): 'overdue' | 'week' | 'later' {
  if (m.overdue) return 'overdue'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = (new Date(m.date).getTime() - today.getTime()) / 86_400_000
  return diff <= 7 ? 'week' : 'later'
}

const BUCKETS = [
  { key: 'overdue', title: 'Εκπρόθεσμα', hint: 'Έχουν περάσει την ημερομηνία τους.' },
  { key: 'week', title: 'Αυτή την εβδομάδα', hint: 'Οι επόμενες επτά ημέρες.' },
  { key: 'later', title: 'Αργότερα', hint: null },
] as const

export default async function PortalTimelinePage() {
  const session = await auth()
  const scope = await getPortalScope(session!.user.id)
  if (!scope) return null

  const milestones = await listMilestones(scope)

  const groups = new Map<string, Milestone[]>()
  for (const m of milestones) {
    const key = bucketOf(m)
    const bucket = groups.get(key)
    if (bucket) bucket.push(m)
    else groups.set(key, [m])
  }

  const overdueCount = groups.get('overdue')?.length ?? 0

  return (
    <div className="space-y-6">
      <header className="animate-fade-in">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
          Πύλη πελατών
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-fluent-neutral-90 sm:text-2xl">
          Χρονοδιάγραμμα
        </h1>
        <p className="mt-1.5 text-sm text-fluent-neutral-70">
          {milestones.length > 0
            ? `${milestones.length} ${milestones.length === 1 ? 'ορόσημο' : 'ορόσημα'}${
                overdueCount > 0 ? ` · ${overdueCount} εκπρόθεσμα` : ''
              }`
            : 'Οι προθεσμίες των έργων σας, σε μία σειρά.'}
        </p>
      </header>

      {milestones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-fluent-neutral-80">Καμία προθεσμία</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-fluent-neutral-60">
            Μόλις οριστούν ημερομηνίες παράδοσης, θα τις βλέπετε εδώ με τη σειρά τους.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKETS.map((b) => {
            const rows = groups.get(b.key)
            if (!rows?.length) return null

            const attention = b.key === 'overdue'

            return (
              <section
                key={b.key}
                className={
                  attention
                    ? 'rounded-xl border border-fluent-accent-orange/25 bg-[#fffaf5] p-4 shadow-fluent-2'
                    : 'rounded-xl border border-fluent-neutral-10 bg-white p-4 shadow-fluent-2'
                }
              >
                <h2 className="font-display text-base font-semibold text-fluent-neutral-90">
                  {b.title}
                  <span className="ml-2 text-xs font-normal tabular-nums text-fluent-neutral-50">
                    {rows.length}
                  </span>
                </h2>
                {b.hint && <p className="mt-0.5 text-xs text-fluent-neutral-60">{b.hint}</p>}

                <div className="mt-2">
                  <PortalMilestones milestones={rows} />
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
