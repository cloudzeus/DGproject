import Link from 'next/link'

/**
 * Stat tile — η σωστή μορφή για έναν μοναδικό αριθμό.
 *
 * Ο αριθμός φοράει tabular figures ώστε οι στήλες να μη χοροπηδούν όταν αλλάζει
 * η τιμή, και το χρώμα του κειμένου μένει πάντα ink token: ο τόνος τον δίνει το
 * accent στο περίγραμμα/εικονίδιο, όχι βαμμένο νούμερο.
 */
export function PortalStat({
  label,
  value,
  suffix,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string
  value: number | string
  suffix?: string
  hint?: string
  tone?: 'neutral' | 'attention'
  href?: string
}) {
  const attention = tone === 'attention'

  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums leading-none text-fluent-neutral-90">
        {value}
        {suffix && (
          <span className="ml-0.5 text-lg font-medium text-fluent-neutral-60">{suffix}</span>
        )}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-fluent-neutral-60">{hint}</p>}
    </>
  )

  const className = [
    'block rounded-xl border bg-white p-4 shadow-fluent-2 transition-shadow duration-150',
    attention
      ? 'border-fluent-accent-orange/30 bg-[#fffaf5]'
      : 'border-fluent-neutral-10',
    href ? 'hover:shadow-fluent-8 cursor-pointer' : '',
  ].join(' ')

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
