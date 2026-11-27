'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowSync16Regular,
  Bot24Regular,
  Checkmark16Regular,
  Dismiss16Regular,
  Send16Regular,
} from '@fluentui/react-icons'
import { analyzeProjectForAiMerges, retryAiMergeEmails, reviewAiMerge } from './actions'
import { TASK_MERGE_APPROVER_EMAIL } from '@/lib/ai/task-merge-rules'

export type AiMergeProposalView = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
  primaryTaskId: string
  title: string
  description: string
  rationale: string
  confidence: number
  tasks: Array<{ id: string; title: string; questionCount: number }>
  explanation: string | null
  emailError: string | null
  emailSentCount: number
  recipientCount: number
  emailSentAt: string | null
  createdAt: string
  provider: string | null
  model: string | null
}

type Project = { id: string; name: string; color: string }

export function AiMergesClient({
  projects,
  selectedProject,
  proposals,
  canApprove,
  currentUserEmail,
}: {
  projects: Project[]
  selectedProject: Project | null
  proposals: AiMergeProposalView[]
  canApprove: boolean
  currentUserEmail: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const pendingProposals = proposals.filter((proposal) => proposal.status === 'pending')
  const approvedProposals = proposals.filter((proposal) => proposal.status === 'approved')

  function analyze() {
    if (!selectedProject) return
    setFeedback(null)
    setActiveId('analyze')
    startTransition(async () => {
      const result = await analyzeProjectForAiMerges(selectedProject.id)
      setActiveId(null)
      if (!result.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'Η ανάλυση απέτυχε.' })
        return
      }
      setFeedback({
        kind: 'success',
        text: result.count
          ? `Δημιουργήθηκαν ${result.count} νέες AI προτάσεις προς έγκριση.`
          : 'Δεν βρέθηκαν tasks ή ερωτήματα που να μπορούν να ενσωματωθούν με ασφάλεια σε ένα.',
      })
      router.refresh()
    })
  }

  function review(proposal: AiMergeProposalView, decision: 'approve' | 'reject') {
    if (decision === 'approve') {
      const accepted = window.confirm(
        `Θα συγχωνευθούν ${proposal.tasks.length} tasks στο «${proposal.title}». Μετά τη συγχώνευση θα δημιουργηθεί AI επεξήγηση και θα σταλεί στους συμμετέχοντες. Θέλετε να συνεχίσετε;`,
      )
      if (!accepted) return
    }
    setFeedback(null)
    setActiveId(proposal.id)
    startTransition(async () => {
      const result = await reviewAiMerge(proposal.id, decision)
      setActiveId(null)
      if (!result.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'Η ενέργεια απέτυχε.' })
        return
      }
      setFeedback(result.warning
        ? { kind: 'warning', text: result.warning }
        : { kind: 'success', text: decision === 'approve'
            ? 'Η συγχώνευση ολοκληρώθηκε και η AI επεξήγηση στάλθηκε στους συμμετέχοντες.'
            : 'Η πρόταση απορρίφθηκε. Κανένα task δεν άλλαξε.' })
      router.refresh()
    })
  }

  function retry(proposalId: string) {
    setFeedback(null)
    setActiveId(proposalId)
    startTransition(async () => {
      const result = await retryAiMergeEmails(proposalId)
      setActiveId(null)
      setFeedback(result.ok
        ? { kind: 'success', text: 'Η αποστολή της AI επεξήγησης ολοκληρώθηκε.' }
        : { kind: 'error', text: result.error ?? 'Η αποστολή απέτυχε ξανά.' })
      router.refresh()
    })
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Bot24Regular className="h-7 w-7 text-fluent-blue-600" />
            <h1 className="text-2xl font-semibold text-fluent-neutral-90">AI Συγχωνεύσεις</h1>
          </div>
          <p className="mt-2 text-sm text-fluent-neutral-60 max-w-2xl leading-6">
            Εντοπισμός tasks και ερωτημάτων που περιγράφουν την ίδια εργασία, με ανθρώπινη έγκριση πριν από κάθε αλλαγή.
          </p>
        </div>
        <div className="rounded-lg border border-fluent-blue-100 bg-fluent-blue-50 px-4 py-3 text-sm text-fluent-neutral-80">
          <div className="font-semibold">Αποκλειστικός approver</div>
          <div className="mt-0.5">{TASK_MERGE_APPROVER_EMAIL}</div>
        </div>
      </header>

      <section className="rounded-xl border border-black/5 bg-white shadow-fluent-2 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex-1 text-sm font-medium text-fluent-neutral-80">
            Project προς ανάλυση
            <select
              value={selectedProject?.id ?? ''}
              disabled={pending || projects.length === 0}
              onChange={(event) => {
                setFeedback(null)
                router.push(`/ai-merges?project=${encodeURIComponent(event.target.value)}`)
              }}
              className="mt-1.5 block w-full min-h-11 rounded-md border border-black/10 bg-white px-3 text-sm text-fluent-neutral-90 focus:outline-none focus:ring-2 focus:ring-fluent-blue-500 disabled:opacity-60"
            >
              {projects.length === 0 && <option value="">Δεν υπάρχουν projects</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={analyze}
            disabled={pending || !selectedProject}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-fluent-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-fluent-blue-700 focus:outline-none focus:ring-2 focus:ring-fluent-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowSync16Regular className={activeId === 'analyze' ? 'animate-spin' : ''} />
            {activeId === 'analyze' ? 'Ανάλυση με AI…' : 'Νέα AI ανάλυση'}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-fluent-neutral-50">
          Αναλύονται έως 50 μη ολοκληρωμένα tasks του επιλεγμένου project, μαζί με τις ερωτήσεις και τις απαντήσεις τους. Δεν γίνεται αυτόματη συγχώνευση.
        </p>
      </section>

      {feedback && (
        <div role="status" className={
          feedback.kind === 'error'
            ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'
            : feedback.kind === 'warning'
              ? 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
              : 'rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800'
        }>
          {feedback.text}
        </div>
      )}

      <section className="space-y-4" aria-labelledby="pending-title">
        <div className="flex items-center justify-between">
          <h2 id="pending-title" className="text-lg font-semibold text-fluent-neutral-90">Προς έγκριση</h2>
          <span className="text-sm text-fluent-neutral-50">{pendingProposals.length}</span>
        </div>
        {pendingProposals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 bg-white/60 px-5 py-10 text-center text-sm text-fluent-neutral-50">
            Δεν υπάρχουν προτάσεις σε αναμονή για αυτό το project.
          </div>
        ) : pendingProposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            project={selectedProject}
            canApprove={canApprove}
            currentUserEmail={currentUserEmail}
            busy={pending}
            active={activeId === proposal.id}
            onReview={review}
          />
        ))}
      </section>

      {approvedProposals.length > 0 && (
        <section className="space-y-4" aria-labelledby="approved-title">
          <h2 id="approved-title" className="text-lg font-semibold text-fluent-neutral-90">Πρόσφατες εγκεκριμένες συγχωνεύσεις</h2>
          {approvedProposals.map((proposal) => (
            <article key={proposal.id} className="rounded-xl border border-black/5 bg-white shadow-fluent-2 p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-fluent-neutral-90">{proposal.title}</h3>
                  <p className="mt-1 text-xs text-fluent-neutral-50">{proposal.tasks.length} αρχικά tasks · {proposal.emailSentCount}/{proposal.recipientCount} emails</p>
                </div>
                {proposal.emailSentAt && !proposal.emailError ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
                    <Checkmark16Regular /> Απεστάλη
                  </span>
                ) : canApprove ? (
                  <button
                    type="button"
                    onClick={() => retry(proposal.id)}
                    disabled={pending}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-fluent-blue-200 px-4 text-sm font-semibold text-fluent-blue-700 hover:bg-fluent-blue-50 focus:outline-none focus:ring-2 focus:ring-fluent-blue-500 disabled:opacity-50"
                  >
                    <Send16Regular /> {activeId === proposal.id ? 'Αποστολή…' : 'Επανάληψη αποστολής'}
                  </button>
                ) : null}
              </div>
              {proposal.emailError && <p className="mt-3 text-sm text-amber-800">{proposal.emailError}</p>}
              {proposal.explanation && (
                <details className="mt-4 rounded-lg bg-fluent-neutral-4/50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-fluent-neutral-80 focus:outline-none focus:ring-2 focus:ring-fluent-blue-500">AI επεξήγηση</summary>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-fluent-neutral-80">{proposal.explanation}</p>
                </details>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  )
}

function ProposalCard({
  proposal,
  project,
  canApprove,
  currentUserEmail,
  busy,
  active,
  onReview,
}: {
  proposal: AiMergeProposalView
  project: Project | null
  canApprove: boolean
  currentUserEmail: string
  busy: boolean
  active: boolean
  onReview: (proposal: AiMergeProposalView, decision: 'approve' | 'reject') => void
}) {
  return (
    <article className="rounded-xl border border-black/5 bg-white shadow-fluent-2 overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-fluent-neutral-50">
              {project && <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />}
              <span>{project?.name}</span>
              <span>·</span>
              <span>{new Date(proposal.createdAt).toLocaleString('el-GR')}</span>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-fluent-neutral-90">{proposal.title}</h3>
          </div>
          <span className="self-start rounded-full bg-fluent-blue-50 px-3 py-1 text-xs font-semibold text-fluent-blue-700">
            AI βεβαιότητα {Math.round(proposal.confidence * 100)}%
          </span>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fluent-neutral-50">Γιατί προτείνεται</h4>
          <p className="mt-1.5 text-sm leading-6 text-fluent-neutral-80">{proposal.rationale}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fluent-neutral-50">Ενιαία περιγραφή</h4>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-fluent-neutral-80">{proposal.description}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fluent-neutral-50">Tasks και ερωτήματα που ενσωματώνονται</h4>
          <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/5">
            {proposal.tasks.map((task) => (
              <li key={task.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2.5 text-sm">
                <span className="flex-1 text-fluent-neutral-90">{task.title}</span>
                <span className="text-xs text-fluent-neutral-50">{task.questionCount} ερωτήματα</span>
                {task.id === proposal.primaryTaskId && (
                  <span className="self-start rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800">Κύριο task</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-black/5 bg-fluent-neutral-4/30 px-5 py-4">
        <p className="text-xs leading-5 text-fluent-neutral-50">
          {canApprove
            ? `Συνδεδεμένος approver: ${currentUserEmail}`
            : `Μόνο το ${TASK_MERGE_APPROVER_EMAIL} μπορεί να αξιολογήσει την πρόταση.`}
        </p>
        {canApprove && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onReview(proposal, 'reject')}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-fluent-neutral-80 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-fluent-blue-500 disabled:opacity-50"
            >
              <Dismiss16Regular /> Απόρριψη
            </button>
            <button
              type="button"
              onClick={() => onReview(proposal, 'approve')}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2 disabled:opacity-50"
            >
              <Checkmark16Regular /> {active ? 'Συγχώνευση…' : 'Έγκριση & αποστολή'}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
