import type { PortalMeetingDetail } from '@/lib/portal/meetings'

/**
 * Τα πρακτικά όπως τα διαβάζει ο πελάτης.
 *
 * ΔΕΝ ΑΠΟΔΙΔΕΙ EMAIL. Τα insights του LLM κουβαλούν `assigneeEmail`,
 * `ownerEmail`, `participantEmails`, `askedToEmail` — διευθύνσεις της ομάδας που
 * κανείς δεν αποφάσισε να εκθέσει. Το portal έχει ήδη ρητό μηχανισμό γι' αυτό
 * (`ProjectMember.visibleToCustomer`, καρτέλα Ομάδα)· τα πρακτικά δεν τον
 * παρακάμπτουν από την πίσω πόρτα. Ο πελάτης βλέπει ΤΙ συμφωνήθηκε, και μαθαίνει
 * ποιος το κάνει από την καρτέλα που το λέει επίσημα.
 *
 * Οι ενότητες που έμειναν κενές μετά το φίλτρο δεν αποδίδονται καθόλου — κενή
 * επικεφαλίδα «Ρίσκα» θα έλεγε στον πελάτη ότι υπάρχουν ρίσκα που δεν βλέπει.
 */

const SEVERITY_LABEL: Record<string, string> = {
  low: 'χαμηλό',
  medium: 'μεσαίο',
  high: 'υψηλό',
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'χαμηλή',
  medium: 'μεσαία',
  high: 'υψηλή',
  urgent: 'επείγουσα',
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string
  count: number
  accent: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-2 font-display text-base font-semibold text-fluent-neutral-90">
        <span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
        {title}
        <span className="text-xs font-normal tabular-nums text-fluent-neutral-50">{count}</span>
      </h2>
      {children}
    </section>
  )
}

export function MomView({ meeting }: { meeting: PortalMeetingDetail }) {
  const { summary, decisions, actionItems, risks, openQuestions } = meeting

  const empty =
    !summary &&
    decisions.length === 0 &&
    actionItems.length === 0 &&
    risks.length === 0 &&
    openQuestions.length === 0

  if (empty) {
    return (
      <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-10 text-center">
        <p className="text-sm text-fluent-neutral-60">
          Δεν υπάρχει διαθέσιμο περιεχόμενο για αυτή τη σύσκεψη.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {summary && (
        <Section title="Περίληψη" count={0} accent="#0078D4">
          <div className="rounded-xl border border-fluent-neutral-10 bg-white p-4 shadow-fluent-2">
            <p className="whitespace-pre-line text-sm leading-relaxed text-fluent-neutral-80">
              {summary}
            </p>
          </div>
        </Section>
      )}

      {decisions.length > 0 && (
        <Section title="Αποφάσεις" count={decisions.length} accent="#0078D4">
          <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
            {decisions.map((d, i) => (
              <li key={i} className="flex gap-3 px-4 py-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fluent-blue-600" aria-hidden />
                <p className="text-sm leading-relaxed text-fluent-neutral-80">{d.text}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {actionItems.length > 0 && (
        <Section title="Ενέργειες" count={actionItems.length} accent="#107C10">
          <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
            {actionItems.map((a, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-sm font-medium text-fluent-neutral-90">{a.title}</p>
                {a.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-fluent-neutral-70">
                    {a.description}
                  </p>
                )}
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-fluent-neutral-60">
                  <span>Προτεραιότητα: {PRIORITY_LABEL[a.priority] ?? a.priority}</span>
                  {a.dueDate && (
                    <span>
                      Προθεσμία:{' '}
                      {new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' }).format(
                        new Date(a.dueDate),
                      )}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {risks.length > 0 && (
        <Section title="Ρίσκα" count={risks.length} accent="#D83B01">
          <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-accent-orange/25 bg-[#fffaf5] shadow-fluent-2">
            {risks.map((r, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-sm leading-relaxed text-fluent-neutral-80">{r.text}</p>
                <p className="mt-0.5 text-[11px] text-fluent-neutral-60">
                  Σοβαρότητα: {SEVERITY_LABEL[r.severity] ?? r.severity}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {openQuestions.length > 0 && (
        <Section title="Ανοιχτά ερωτήματα" count={openQuestions.length} accent="#8764B8">
          <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
            {openQuestions.map((q, i) => (
              <li key={i} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0 font-display text-sm font-semibold text-fluent-accent-purple">
                  ?
                </span>
                <p className="text-sm leading-relaxed text-fluent-neutral-80">{q.question}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
