import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { TICKET_STATUS_LABEL } from '@/lib/tickets/status-labels'
import type { TicketStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<TicketStatus, string> = {
  new: 'bg-fluent-accent-orange text-white',
  analyzing: 'bg-fluent-blue-100 text-fluent-blue-700',
  triaged: 'bg-fluent-blue-600 text-white',
  converted: 'bg-purple-100 text-purple-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-neutral-200 text-neutral-600',
  rejected: 'bg-red-100 text-red-700',
  needs_info: 'bg-amber-100 text-amber-800',
  merged: 'bg-neutral-200 text-neutral-600',
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: '🐞 Σφάλμα',
  feature: '✨ Νέα λειτουργία',
  support: '🛟 Υποστήριξη',
  question: '❓ Ερώτηση',
  billing: '💶 Χρέωση',
  other: '📋 Άλλο',
}

const OPEN_STATUSES: TicketStatus[] = ['new', 'analyzing', 'triaged']

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>
}) {
  const session = await auth()
  const role = session?.user?.role
  if (!session?.user?.id || (role !== 'admin' && role !== 'manager')) redirect('/dashboard')

  const { status, source } = await searchParams
  const statusFilter =
    status && status in TICKET_STATUS_LABEL ? (status as TicketStatus) : undefined

  const [tickets, sources] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(source ? { sourceId: source } : {}),
      },
      include: { source: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.ticketSource.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  // Open tickets first, then the rest — newest first inside each group.
  const sorted = [...tickets].sort((a, b) => {
    const ao = OPEN_STATUSES.includes(a.status) ? 0 : 1
    const bo = OPEN_STATUSES.includes(b.status) ? 0 : 1
    return ao - bo || b.createdAt.getTime() - a.createdAt.getTime()
  })

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' })
  const filterLink = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.source) q.set('source', params.source)
    const s = q.toString()
    return s ? `/tickets?${s}` : '/tickets'
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-fluent-neutral-90">Tickets</h1>
          <p className="text-sm text-fluent-neutral-60 mt-1">
            Αιτήματα υποστήριξης από όλα τα συνδεδεμένα projects — ανάλυση DeepSeek και ανάθεση σε εργασίες.
          </p>
        </div>
        <Link
          href="/admin/ticket-sources"
          className="text-sm font-medium text-fluent-blue-600 hover:underline"
        >
          Διαχείριση πηγών →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Link
          href={filterLink({ source })}
          className={`px-3 py-1 rounded-full text-xs font-medium border ${!statusFilter ? 'bg-fluent-blue-600 text-white border-fluent-blue-600' : 'border-neutral-300 text-fluent-neutral-70 hover:bg-black/5'}`}
        >
          Όλα
        </Link>
        {(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => (
          <Link
            key={s}
            href={filterLink({ status: s, source })}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${statusFilter === s ? 'bg-fluent-blue-600 text-white border-fluent-blue-600' : 'border-neutral-300 text-fluent-neutral-70 hover:bg-black/5'}`}
          >
            {TICKET_STATUS_LABEL[s]}
          </Link>
        ))}
        {sources.length > 1 && (
          <span className="ml-auto flex gap-2">
            {sources.map((s) => (
              <Link
                key={s.id}
                href={filterLink({ status, source: source === s.id ? undefined : s.id })}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${source === s.id ? 'bg-fluent-neutral-90 text-white border-fluent-neutral-90' : 'border-neutral-300 text-fluent-neutral-70 hover:bg-black/5'}`}
              >
                {s.name}
              </Link>
            ))}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-sm text-fluent-neutral-60">
          Δεν υπάρχουν tickets{statusFilter ? ` με κατάσταση «${TICKET_STATUS_LABEL[statusFilter]}»` : ''}.
        </div>
      ) : (
        <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wider text-fluent-neutral-50">
                <th className="px-4 py-3 font-semibold">Κωδικός</th>
                <th className="px-4 py-3 font-semibold">Θέμα</th>
                <th className="px-4 py-3 font-semibold">Πηγή</th>
                <th className="px-4 py-3 font-semibold">Κατηγορία</th>
                <th className="px-4 py-3 font-semibold">Κατάσταση</th>
                <th className="px-4 py-3 font-semibold">Υποβλήθηκε</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className="border-b border-black/5 last:border-0 hover:bg-fluent-blue-50/40">
                  <td className="px-4 py-3 font-mono text-xs text-fluent-neutral-70 whitespace-nowrap">
                    <Link href={`/tickets/${t.id}`} className="hover:underline">{t.code}</Link>
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <Link href={`/tickets/${t.id}`} className="font-medium text-fluent-neutral-90 hover:text-fluent-blue-600 line-clamp-1">
                      {t.aiTitle ?? t.subject}
                    </Link>
                    <span className="text-xs text-fluent-neutral-50">{t.reporterEmail}</span>
                  </td>
                  <td className="px-4 py-3 text-fluent-neutral-70 whitespace-nowrap">{t.source.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {t.aiCategory ? CATEGORY_LABEL[t.aiCategory] : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[t.status]}`}>
                      {TICKET_STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-fluent-neutral-60 whitespace-nowrap">{fmt.format(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
