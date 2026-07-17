'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  convertTicketToTask,
  rejectTicket,
  reanalyzeTicket,
  updateTicketAi,
  saveKnowledgeEntry,
} from '../actions'
import { polishSolution, saveResolution } from '../resolution-actions'
import type { TaskPriority, TicketCategory, TicketStatus } from '@prisma/client'

type TicketView = {
  id: string
  code: string
  status: TicketStatus
  statusLabel: string
  subject: string
  body: string
  reporterEmail: string
  reporterName: string | null
  originUrl: string
  sourceName: string
  createdAt: string
  aiTitle: string | null
  aiDescription: string | null
  aiCategory: TicketCategory | null
  aiPriority: TaskPriority | null
  aiSuggestedProjectId: string | null
  aiSuggestedAssigneeId: string | null
  aiReasoning: string | null
  aiConfidence: number | null
  aiError: string | null
  resolutionSummary: string | null
  task: { id: string; title: string; status: string; projectId: string; projectName: string } | null
}

type Props = {
  ticket: TicketView
  attachments: { id: string; name: string; url: string; mimeType: string }[]
  projects: { id: string; name: string; projectCode: string | null }[]
  users: { id: string; name: string; hint: string }[]
  events: { id: string; type: string; payload: Record<string, unknown> | null; createdAt: string }[]
  kbDraft: { title: string; problem: string; solution: string; tags: string[] } | null
  kbSaved: { id: string; title: string } | null
}

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'bug', label: '🐞 Σφάλμα' },
  { value: 'feature', label: '✨ Νέα λειτουργία' },
  { value: 'support', label: '🛟 Υποστήριξη' },
  { value: 'question', label: '❓ Ερώτηση' },
  { value: 'billing', label: '💶 Χρέωση' },
  { value: 'other', label: '📋 Άλλο' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Χαμηλή' },
  { value: 'medium', label: 'Μεσαία' },
  { value: 'high', label: 'Υψηλή' },
  { value: 'urgent', label: 'Επείγουσα' },
]

function eventLabel(type: string, payload: Record<string, unknown> | null): string {
  switch (type) {
    case 'created': return 'Καταχωρήθηκε'
    case 'analyzed': return payload?.error ? `Η ανάλυση απέτυχε` : 'Αναλύθηκε από το AI'
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

export function TicketDetailClient({ ticket, attachments, projects, users, events, kbDraft, kbSaved }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(ticket.aiTitle ?? ticket.subject)
  const [description, setDescription] = useState(ticket.aiDescription ?? ticket.body)
  const [category, setCategory] = useState<TicketCategory>(ticket.aiCategory ?? 'other')
  const [priority, setPriority] = useState<TaskPriority>(ticket.aiPriority ?? 'medium')
  const [projectId, setProjectId] = useState(ticket.aiSuggestedProjectId ?? '')
  const [assigneeId, setAssigneeId] = useState(ticket.aiSuggestedAssigneeId ?? '')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  const [kbTitle, setKbTitle] = useState(kbDraft?.title ?? '')
  const [kbProblem, setKbProblem] = useState(kbDraft?.problem ?? '')
  const [kbSolution, setKbSolution] = useState(kbDraft?.solution ?? '')
  const [kbTags, setKbTags] = useState(kbDraft?.tags?.join(', ') ?? '')

  const isOpen = ['new', 'analyzing', 'triaged'].includes(ticket.status)
  const fmt = (iso: string) => new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fn()
        if (!res.ok) setError(res.error ?? 'Κάτι πήγε στραβά.')
        else router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Κάτι πήγε στραβά.')
      }
    })
  }

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ─── Original ticket ─── */}
      <div className="space-y-4">
        <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-fluent-neutral-60">{ticket.code}</span>
            <span className="rounded-full bg-fluent-blue-50 px-3 py-0.5 text-xs font-semibold text-fluent-blue-700">
              {ticket.statusLabel}
            </span>
          </div>
          <h1 className="mt-2 text-lg font-semibold text-fluent-neutral-90">{ticket.subject}</h1>
          <p className="mt-3 whitespace-pre-wrap text-sm text-fluent-neutral-80 leading-relaxed">{ticket.body}</p>
          <dl className="mt-4 space-y-1 border-t border-black/5 pt-3 text-xs text-fluent-neutral-60">
            <div><dt className="inline font-semibold">Από: </dt><dd className="inline">{ticket.reporterName ? `${ticket.reporterName} · ` : ''}{ticket.reporterEmail}</dd></div>
            <div><dt className="inline font-semibold">Πηγή: </dt><dd className="inline">{ticket.sourceName}</dd></div>
            <div><dt className="inline font-semibold">Σελίδα: </dt><dd className="inline break-all">{ticket.originUrl || '—'}</dd></div>
            <div><dt className="inline font-semibold">Υποβλήθηκε: </dt><dd className="inline">{fmt(ticket.createdAt)}</dd></div>
          </dl>
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5">
            <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-3">📎 Συνημμένα</h2>
            <div className="flex flex-wrap gap-3">
              {attachments.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group w-24 text-center">
                  <img
                    src={a.url}
                    alt={a.name}
                    className="h-20 w-20 rounded-md object-cover border border-black/5 mx-auto"
                  />
                  <p className="mt-1 truncate text-[11px] text-fluent-neutral-60 group-hover:underline">{a.name}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5">
          <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-3">Ιστορικό</h2>
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-baseline gap-2 text-xs">
                <span className="text-fluent-neutral-50 whitespace-nowrap w-28 shrink-0">{fmt(e.createdAt)}</span>
                <span className="text-fluent-neutral-80">{eventLabel(e.type, e.payload)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── AI panel + triage ─── */}
      <div className="space-y-4">
        {ticket.task ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm">
            <p className="font-semibold text-green-800">Έχει ανατεθεί ως εργασία</p>
            <p className="mt-1 text-green-700">
              <Link href={`/projects/${ticket.task.projectId}`} className="underline">
                [{ticket.task.projectName}] {ticket.task.title}
              </Link>{' '}
              — κατάσταση: {ticket.task.status}
            </p>
          </div>
        ) : null}

        <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-fluent-neutral-90">
              🤖 Πρόταση AI
              {typeof ticket.aiConfidence === 'number' && (
                <span className="ml-2 text-xs font-normal text-fluent-neutral-50">
                  βεβαιότητα {(ticket.aiConfidence * 100).toFixed(0)}%
                </span>
              )}
            </h2>
            {isOpen && (
              <button
                onClick={() => run(() => reanalyzeTicket(ticket.id))}
                disabled={pending}
                className="text-xs font-medium text-fluent-blue-600 hover:underline disabled:opacity-50"
              >
                ↻ Επανάληψη ανάλυσης
              </button>
            )}
          </div>

          {ticket.aiError && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Η αυτόματη ανάλυση απέτυχε — κάντε χειροκίνητο triage. ({ticket.aiError.slice(0, 200)})
            </div>
          )}

          <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Τίτλος εργασίας</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isOpen}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-fluent-blue-500 focus:outline-none disabled:bg-neutral-50"
          />

          <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Τεχνική περιγραφή</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isOpen}
            rows={8}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm leading-relaxed focus:border-fluent-blue-500 focus:outline-none disabled:bg-neutral-50"
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Κατηγορία</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                disabled={!isOpen}
                className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm disabled:bg-neutral-50"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Προτεραιότητα</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                disabled={!isOpen}
                className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm disabled:bg-neutral-50"
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {ticket.aiReasoning && (
            <details className="mt-3 rounded-md bg-fluent-blue-50/50 px-3 py-2 text-xs text-fluent-neutral-70">
              <summary className="cursor-pointer font-semibold">Σκεπτικό AI</summary>
              <p className="mt-1 whitespace-pre-wrap">{ticket.aiReasoning}</p>
            </details>
          )}
        </div>

        {isOpen && (
          <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5">
            <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-3">Ανάθεση</h2>

            <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Έργο</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
            >
              <option value="">— Επιλέξτε έργο —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectCode ? `${p.projectCode} · ` : ''}{p.name}
                  {p.id === ticket.aiSuggestedProjectId ? '  ★ πρόταση AI' : ''}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Χρέωση σε</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
            >
              <option value="">— Χωρίς ανάθεση —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.id === ticket.aiSuggestedAssigneeId ? ' ★ πρόταση AI' : ''} — {u.hint}
                </option>
              ))}
            </select>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  run(async () => {
                    const saved = await updateTicketAi({ ticketId: ticket.id, title, description, category, priority })
                    if (!saved.ok) return saved
                    if (!projectId) return { ok: false, error: 'Επιλέξτε έργο.' }
                    return convertTicketToTask({
                      ticketId: ticket.id,
                      projectId,
                      assigneeId: assigneeId || null,
                      title,
                      description,
                      priority,
                    })
                  })
                }
                disabled={pending}
                className="rounded-md bg-fluent-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fluent-blue-700 disabled:opacity-50"
              >
                {pending ? 'Παρακαλώ περιμένετε…' : 'Δημιουργία εργασίας'}
              </button>
              <button
                onClick={() => setShowReject((v) => !v)}
                disabled={pending}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-fluent-neutral-80 hover:bg-black/5 disabled:opacity-50"
              >
                Απόρριψη
              </button>
            </div>

            {showReject && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                <label className="block text-xs font-semibold text-red-800 mb-1">Λόγος απόρριψης (προαιρετικά)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-red-200 px-3 py-2 text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => run(() => rejectTicket({ ticketId: ticket.id, reason: rejectReason, notifyReporter: true }))}
                    disabled={pending}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Απόρριψη + email
                  </button>
                  <button
                    onClick={() => run(() => rejectTicket({ ticketId: ticket.id, reason: rejectReason, notifyReporter: false }))}
                    disabled={pending}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Σιωπηλή απόρριψη (spam)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Resolution ─── */}
        {(ticket.status === 'converted' || ticket.status === 'resolved') && (
          <ResolutionSection ticketId={ticket.id} initial={ticket.resolutionSummary} />
        )}

        {/* ─── Knowledge Base ─── */}
        {kbSaved ? (
          <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5 text-sm">
            <h2 className="text-sm font-semibold text-fluent-neutral-90">📚 Γνωσιακή βάση</h2>
            <p className="mt-1 text-fluent-neutral-70">Αποθηκεύτηκε: «{kbSaved.title}»</p>
          </div>
        ) : ticket.status === 'resolved' ? (
          <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5">
            <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-1">📚 Καταχώρηση στη γνωσιακή βάση</h2>
            <p className="text-xs text-fluent-neutral-60 mb-3">
              {kbDraft ? 'Πρόχειρο από το AI — ελέγξτε και αποθηκεύστε.' : 'Συμπληρώστε το πρόβλημα και τη λύση.'}
            </p>
            <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Τίτλος</label>
            <input value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Πρόβλημα</label>
            <textarea value={kbProblem} onChange={(e) => setKbProblem(e.target.value)} rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Λύση</label>
            <textarea value={kbSolution} onChange={(e) => setKbSolution(e.target.value)} rows={4} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Λέξεις-κλειδιά (με κόμμα)</label>
            <input value={kbTags} onChange={(e) => setKbTags(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <button
              onClick={() =>
                run(() =>
                  saveKnowledgeEntry({
                    ticketId: ticket.id,
                    title: kbTitle,
                    problem: kbProblem,
                    solution: kbSolution,
                    tags: kbTags.split(',').map((t) => t.trim()).filter(Boolean),
                  })
                )
              }
              disabled={pending || !kbTitle.trim() || !kbSolution.trim()}
              className="mt-4 rounded-md bg-fluent-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fluent-blue-700 disabled:opacity-50"
            >
              Αποθήκευση στο KB & κλείσιμο
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ResolutionSection({ ticketId, initial }: { ticketId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? '')
  const [original, setOriginal] = useState<string | null>(null) // pre-polish text, for undo
  const [saved, setSaved] = useState(Boolean(initial))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const polish = () =>
    startTransition(async () => {
      setError(null)
      const res = await polishSolution({ ticketId, text })
      if (res.ok) {
        setOriginal(text)
        setText(res.text)
      } else setError(res.error)
    })

  const save = () =>
    startTransition(async () => {
      setError(null)
      const res = await saveResolution({ ticketId, text })
      if (res.ok) setSaved(true)
      else setError(res.error)
    })

  return (
    <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5">
      <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-1">🛠️ Λύση</h2>
      <p className="text-xs text-fluent-neutral-60 mb-3">
        Περιγραφή της λύσης από τον τεχνικό — τροφοδοτεί το προσχέδιο της γνωσιακής βάσης.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        maxLength={4000}
        rows={5}
        placeholder="Τι προκαλούσε το πρόβλημα και πώς λύθηκε; Γράψτε ελεύθερα — μπορείτε μετά να το βελτιώσετε με AI."
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm leading-relaxed focus:border-fluent-blue-500 focus:outline-none"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={polish}
          disabled={pending || text.trim().length < 10}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-fluent-neutral-80 hover:bg-black/5 disabled:opacity-50"
        >
          ✨ Βελτίωση με AI
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !text.trim() || saved}
          className="rounded-md bg-fluent-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fluent-blue-700 disabled:opacity-50"
        >
          {saved ? 'Αποθηκεύτηκε ✓' : pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        {original !== null && (
          <button
            type="button"
            onClick={() => {
              setText(original)
              setOriginal(null)
              setSaved(false)
            }}
            className="text-xs text-fluent-blue-600 hover:underline"
          >
            Επαναφορά αρχικού
          </button>
        )}
      </div>
    </div>
  )
}
