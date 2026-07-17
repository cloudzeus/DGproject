'use client'

import { Fragment, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MoreHorizontal20Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons'
import { TICKET_STATUS_LABEL } from '@/lib/tickets/status-labels'
import { ThreadList } from '@/components/tickets/clarification-thread'
import {
  assignTicketEngineer,
  bulkUpdateTicketStatus,
  mergeTickets,
  getTicketHistory,
  rejectTicket,
} from './actions'
import { requestClarification } from './followup-actions'

export type TicketRow = {
  id: string
  code: string
  subject: string
  aiTitle: string | null
  reporterEmail: string
  sourceName: string
  aiCategory: string | null
  status: string
  createdAt: string
}

type UserOpt = { id: string; name: string | null; email: string }

type History = NonNullable<Awaited<ReturnType<typeof getTicketHistory>>>

const STATUS_BADGE: Record<string, string> = {
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

const CONVERTIBLE = ['new', 'analyzing', 'triaged', 'needs_info']
const REJECTABLE = ['new', 'analyzing', 'triaged']
const CLARIFY_HIDDEN = ['closed', 'rejected', 'merged']

function parsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) return null
  try {
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return null
  }
}

function eventLabel(type: string, payload: Record<string, unknown> | null): string {
  switch (type) {
    case 'created': return 'Καταχωρήθηκε'
    case 'analyzed': return payload?.error ? 'Η ανάλυση απέτυχε' : 'Αναλύθηκε από το AI'
    case 'triaged': return 'Ταξινομήθηκε'
    case 'converted': return 'Μετατράπηκε σε εργασία'
    case 'task_status': return `Κατάσταση εργασίας: ${String(payload?.status ?? '')}`
    case 'emailed': return 'Στάλθηκε email στον χρήστη'
    case 'kb_draft': return 'Δημιουργήθηκε πρόχειρο για τη γνωσιακή βάση'
    case 'resolution_written': return 'Καταγράφηκε η λύση'
    case 'closed': return 'Έκλεισε'
    case 'rejected': return `Απορρίφθηκε${payload?.reason ? `: ${String(payload.reason)}` : ''}`
    case 'note': return 'Επεξεργασία από διαχειριστή'
    case 'clarification_requested': return 'Ζητήθηκε διευκρίνιση'
    case 'reporter_replied': return 'Απάντησε ο πελάτης'
    case 'merged': return 'Συγχωνεύθηκε'
    case 'absorbed': return 'Απορρόφησε συγχωνευμένο ticket'
    default: return type
  }
}

export function TicketsTable({ rows, users }: { rows: TicketRow[]; users: UserOpt[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [histories, setHistories] = useState<Record<string, History>>({})
  const [mergeOpen, setMergeOpen] = useState(false)
  const [clarifyFor, setClarifyFor] = useState<string | null>(null)
  const headerCbRef = useRef<HTMLInputElement>(null)

  const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' })
  const allSelected = rows.length > 0 && selected.size === rows.length

  if (headerCbRef.current) {
    headerCbRef.current.indeterminate = selected.size > 0 && selected.size < rows.length
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (!histories[id]) {
      startTransition(async () => {
        const h = await getTicketHistory(id)
        if (h) setHistories((prev) => ({ ...prev, [id]: h }))
      })
    }
  }

  const bulk = (action: 'reject' | 'close') => {
    const ids = Array.from(selected)
    startTransition(async () => {
      const res = await bulkUpdateTicketStatus({ ticketIds: ids, action })
      alert(`Ενημερώθηκαν: ${res.updated} · Παραλείφθηκαν: ${res.skipped}`)
      setSelected(new Set())
      router.refresh()
    })
  }

  const assign = (ticketId: string, userId: string) => {
    setOpenMenu(null)
    setAssignOpen(false)
    startTransition(async () => {
      const res = await assignTicketEngineer({ ticketId, userId })
      if (!res.ok) alert(res.error)
      else router.refresh()
    })
  }

  const reject = (ticketId: string) => {
    setOpenMenu(null)
    if (!confirm('Απόρριψη του ticket;')) return
    startTransition(async () => {
      const res = await rejectTicket({ ticketId, reason: '', notifyReporter: false })
      if (!res.ok) alert(res.error)
      else router.refresh()
    })
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-fluent-blue-600/20 bg-fluent-blue-50 px-4 py-2.5">
          <span className="text-sm font-medium text-fluent-neutral-90">{selected.size} επιλεγμένα</span>
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => bulk('reject')}
              className="rounded-md border border-fluent-neutral-20 bg-white px-3 py-1.5 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6"
            >
              Απόρριψη
            </button>
            <button
              type="button"
              onClick={() => bulk('close')}
              className="rounded-md border border-fluent-neutral-20 bg-white px-3 py-1.5 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6"
            >
              Κλείσιμο
            </button>
            <button
              type="button"
              onClick={() => setMergeOpen(true)}
              disabled={selected.size < 2}
              className="rounded-md bg-fluent-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50"
            >
              Συγχώνευση
            </button>
          </span>
        </div>
      )}

      <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wider text-fluent-neutral-50">
              <th className="px-4 py-3 font-semibold w-16">
                <input
                  ref={headerCbRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Επιλογή όλων"
                  className="rounded border-neutral-300 accent-fluent-blue-600"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Κωδικός</th>
              <th className="px-4 py-3 font-semibold">Θέμα</th>
              <th className="px-4 py-3 font-semibold">Πηγή</th>
              <th className="px-4 py-3 font-semibold">Κατηγορία</th>
              <th className="px-4 py-3 font-semibold">Κατάσταση</th>
              <th className="px-4 py-3 font-semibold">Υποβλήθηκε</th>
              <th className="px-4 py-3 font-semibold w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const isExpanded = expanded.has(t.id)
              const history = histories[t.id]
              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-black/5 last:border-0 hover:bg-fluent-blue-50/40">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleOne(t.id)}
                          aria-label={`Επιλογή ${t.code}`}
                          className="rounded border-neutral-300 accent-fluent-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => toggleExpand(t.id)}
                          aria-label={isExpanded ? 'Σύμπτυξη' : 'Ανάπτυξη'}
                          className="flex h-6 w-6 items-center justify-center rounded text-fluent-neutral-60 hover:bg-black/5"
                        >
                          {isExpanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                        </button>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fluent-neutral-70 whitespace-nowrap">
                      <Link href={`/tickets/${t.id}`} className="hover:underline">{t.code}</Link>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <Link href={`/tickets/${t.id}`} className="font-medium text-fluent-neutral-90 hover:text-fluent-blue-600 line-clamp-1">
                        {t.aiTitle ?? t.subject}
                      </Link>
                      <span className="text-xs text-fluent-neutral-50">{t.reporterEmail}</span>
                    </td>
                    <td className="px-4 py-3 text-fluent-neutral-70 whitespace-nowrap">{t.sourceName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {t.aiCategory ? CATEGORY_LABEL[t.aiCategory] : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[t.status]}`}>
                        {TICKET_STATUS_LABEL[t.status as keyof typeof TICKET_STATUS_LABEL] ?? t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-fluent-neutral-60 whitespace-nowrap">
                      {fmt.format(new Date(t.createdAt))}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="relative inline-block">
                        <button
                          type="button"
                          onClick={() => {
                            setAssignOpen(false)
                            setOpenMenu(openMenu === t.id ? null : t.id)
                          }}
                          aria-label="Ενέργειες"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-fluent-neutral-60 hover:bg-black/5"
                        >
                          <MoreHorizontal20Regular />
                        </button>
                        {openMenu === t.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => {
                                setOpenMenu(null)
                                setAssignOpen(false)
                              }}
                            />
                            <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-black/5 bg-white shadow-fluent-16 py-1 text-left">
                              <Link
                                href={`/tickets/${t.id}`}
                                className="block px-3 py-2 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6"
                                onClick={() => setOpenMenu(null)}
                              >
                                Άνοιγμα
                              </Link>
                              {CONVERTIBLE.includes(t.status) && (
                                <Link
                                  href={`/tickets/${t.id}`}
                                  className="block px-3 py-2 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6"
                                  onClick={() => setOpenMenu(null)}
                                >
                                  Δημιουργία task
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => setAssignOpen((v) => !v)}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6"
                              >
                                Ανάθεση σε μηχανικό
                                <ChevronRight16Regular className={assignOpen ? 'rotate-90' : ''} />
                              </button>
                              {assignOpen && (
                                <div className="max-h-64 overflow-auto border-y border-black/5 bg-fluent-neutral-4/50">
                                  {users.length === 0 && (
                                    <p className="px-3 py-2 text-xs text-fluent-neutral-50">Δεν βρέθηκαν μηχανικοί.</p>
                                  )}
                                  {users.map((u) => (
                                    <button
                                      key={u.id}
                                      type="button"
                                      onClick={() => assign(t.id, u.id)}
                                      className="block w-full px-4 py-1.5 text-left text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6"
                                    >
                                      <span className="block truncate">{u.name ?? u.email}</span>
                                      {u.name && <span className="block truncate text-[11px] text-fluent-neutral-50">{u.email}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!CLARIFY_HIDDEN.includes(t.status) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenu(null)
                                    setAssignOpen(false)
                                    setClarifyFor(t.id)
                                  }}
                                  className="block w-full px-3 py-2 text-left text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6"
                                >
                                  Ζητήστε διευκρίνιση
                                </button>
                              )}
                              {REJECTABLE.includes(t.status) && (
                                <button
                                  type="button"
                                  onClick={() => reject(t.id)}
                                  className="block w-full px-3 py-2 text-left text-sm text-fluent-accent-red hover:bg-fluent-neutral-6"
                                >
                                  Απόρριψη
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-black/5 last:border-0 bg-fluent-neutral-4/40">
                      <td colSpan={8} className="px-6 py-4">
                        {!history ? (
                          <p className="text-sm text-fluent-neutral-60">Φόρτωση ιστορικού…</p>
                        ) : (
                          <div className="space-y-4">
                            <div className="text-sm text-fluent-neutral-80">
                              <span className="font-semibold text-fluent-neutral-90">AI: </span>
                              {history.aiTitle ?? '—'}
                              {history.aiCategory && <> · {CATEGORY_LABEL[history.aiCategory] ?? history.aiCategory}</>}
                              {history.aiPriority && <> · Προτεραιότητα: {history.aiPriority}</>}
                              {history.aiConfidence != null && <> · Βεβαιότητα: {Math.round(history.aiConfidence * 100)}%</>}
                            </div>
                            <ol className="space-y-1.5">
                              {history.events.map((e) => (
                                <li key={e.id} className="flex items-baseline gap-3 text-sm">
                                  <span className="shrink-0 font-mono text-[11px] text-fluent-neutral-50">
                                    {fmt.format(new Date(e.createdAt))}
                                  </span>
                                  <span className="text-fluent-neutral-80">{eventLabel(e.type, parsePayload(e.payload))}</span>
                                </li>
                              ))}
                            </ol>
                            <ThreadList messages={history.messages} />
                            {history.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {history.attachments.map((a) => (
                                  <a
                                    key={a.id}
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group block"
                                    title={a.name}
                                  >
                                    {/\.(png|jpe?g|gif|webp|svg)$/i.test(a.name) ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={a.url}
                                        alt={a.name}
                                        className="h-16 w-16 rounded-md border border-black/5 object-cover group-hover:opacity-80"
                                      />
                                    ) : (
                                      <span className="inline-flex h-16 items-center rounded-md border border-black/5 bg-white px-3 text-xs text-fluent-neutral-70 group-hover:bg-fluent-neutral-6">
                                        {a.name}
                                      </span>
                                    )}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {clarifyFor && (
        <ClarifyDialog
          ticketId={clarifyFor}
          code={rows.find((r) => r.id === clarifyFor)?.code ?? ''}
          onClose={() => setClarifyFor(null)}
        />
      )}

      {mergeOpen && (
        <MergeDialog
          rows={rows.filter((r) => selected.has(r.id))}
          onClose={() => setMergeOpen(false)}
          onMerged={() => {
            setMergeOpen(false)
            setSelected(new Set())
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function ClarifyDialog({ ticketId, code, onClose }: { ticketId: string; code: string; onClose: () => void }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const send = () =>
    startTransition(async () => {
      setError(null)
      const res = await requestClarification({ ticketId, message: text })
      if (res.ok) {
        onClose()
        router.refresh()
      } else setError(res.error)
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md rounded-xl bg-white shadow-fluent-16"
      >
        <div className="flex items-start justify-between border-b border-black/5 p-4">
          <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">
            Διευκρίνιση · {code}
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={3000}
            rows={4}
            placeholder="Τι θέλετε να ρωτήσετε τον πελάτη;"
            className="w-full rounded-lg border border-fluent-neutral-20 p-3 text-sm text-fluent-neutral-90 focus:border-fluent-blue-500 focus:outline-none"
          />
          {error && <p className="text-sm text-fluent-accent-red">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/5 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-fluent-neutral-70 hover:bg-fluent-neutral-8"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={send}
            disabled={pending || text.trim().length < 5}
            className="rounded-md bg-fluent-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50"
          >
            {pending ? 'Αποστολή…' : 'Αποστολή'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function MergeDialog({
  rows,
  onClose,
  onMerged,
}: {
  rows: TicketRow[]
  onClose: () => void
  onMerged: () => void
}) {
  const [primaryId, setPrimaryId] = useState(rows[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const merge = () =>
    startTransition(async () => {
      setError(null)
      const res = await mergeTickets({
        primaryId,
        secondaryIds: rows.filter((r) => r.id !== primaryId).map((r) => r.id),
      })
      if (res.ok) onMerged()
      else setError(res.error)
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg rounded-xl bg-white shadow-fluent-16"
      >
        <div className="flex items-start justify-between border-b border-black/5 p-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">
              Συγχώνευση tickets
            </h2>
            <p className="mt-0.5 text-xs text-fluent-neutral-60">
              Επιλέξτε το κύριο ticket — τα υπόλοιπα θα συγχωνευθούν σε αυτό.
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>
        <div className="max-h-72 space-y-1 overflow-auto p-4">
          {rows.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${primaryId === r.id ? 'border-fluent-blue-600 bg-fluent-blue-50/60' : 'border-black/5 hover:bg-fluent-neutral-4'}`}
            >
              <input
                type="radio"
                name="merge-primary"
                checked={primaryId === r.id}
                onChange={() => setPrimaryId(r.id)}
                className="accent-fluent-blue-600"
              />
              <span className="font-mono text-xs text-fluent-neutral-70">{r.code}</span>
              <span className="truncate text-fluent-neutral-90">{r.aiTitle ?? r.subject}</span>
            </label>
          ))}
        </div>
        {error && <p className="px-4 pb-2 text-sm text-fluent-accent-red">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-black/5 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-fluent-neutral-70 hover:bg-fluent-neutral-8"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={merge}
            disabled={pending || !primaryId || rows.length < 2}
            className="rounded-md bg-fluent-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50"
          >
            {pending ? 'Συγχώνευση…' : 'Συγχώνευση'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
