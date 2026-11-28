'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpload20Regular, DocumentSearch20Regular, Checkmark20Regular } from '@fluentui/react-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate, statusLabel } from '@/lib/utils'
import { checkTaskContractCoverage } from './contract-actions'

export type ContractCheckView = {
  coverage: 'covered' | 'partial' | 'not_found' | 'unclear'
  confidence: number
  evidence: string | null
  explanation: string
  createdAt: string
}

export type ProjectContractView = {
  fileName: string
  charCount: number
  uploadedByName: string
  createdAt: string
}

const COVERAGE_LABEL = {
  covered: 'Περιλαμβάνεται', partial: 'Μερικώς', not_found: 'Δεν βρέθηκε', unclear: 'Ασαφές',
} as const

export function ProjectContractTab({
  projectId,
  contract,
  tasks,
  canUpload,
  canCheck,
}: {
  projectId: string
  contract: ProjectContractView | null
  tasks: Array<{ id: string; title: string; status: string; check: ContractCheckView | null }>
  canUpload: boolean
  canCheck: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true); setError(null); setMessage(null)
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch(`/api/contracts/${projectId}/upload`, { method: 'POST', body })
      const result = await response.json() as { ok: boolean; error?: string }
      if (!response.ok || !result.ok) { setError(result.error ?? 'Το ανέβασμα απέτυχε.'); return }
      setMessage('Η σύμβαση αναλύθηκε σε κείμενο και αποθηκεύτηκε. Οι προηγούμενοι έλεγχοι μηδενίστηκαν.')
      router.refresh()
    } catch { setError('Το ανέβασμα απέτυχε. Έλεγξε τη σύνδεση και δοκίμασε ξανά.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  function check(taskId: string) {
    setCheckingId(taskId); setError(null); setMessage(null)
    startTransition(async () => {
      const result = await checkTaskContractCoverage(projectId, taskId)
      if (!result.ok) setError(result.error)
      else { setMessage('Ο έλεγχος κάλυψης ολοκληρώθηκε.'); router.refresh() }
      setCheckingId(null)
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-black/5 bg-white p-5 shadow-fluent-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">Σύμβαση έργου</h2>
            <p className="mt-1 text-sm leading-6 text-fluent-neutral-60">
              Εσωτερικός έλεγχος εύρους με DeepSeek. Το αρχείο και το πλήρες κείμενο δεν αποστέλλονται στον browser. Τα αποτελέσματα είναι ενδεικτικά και χρειάζονται ανθρώπινη επιβεβαίωση.
            </p>
          </div>
          {canUpload && (
            <div>
              <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => void upload(event.target.files?.[0])} />
              <Button type="button" variant="primary" icon={<ArrowUpload20Regular />} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Ανέβασμα…' : contract ? 'Αντικατάσταση σύμβασης' : 'Ανέβασμα σύμβασης'}
              </Button>
            </div>
          )}
        </div>
        {contract ? (
          <dl className="mt-4 grid gap-3 border-t border-black/5 pt-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-fluent-neutral-60">Αρχείο</dt><dd className="mt-1 break-words font-medium">{contract.fileName}</dd></div>
            <div><dt className="text-xs text-fluent-neutral-60">Ανέβασε</dt><dd className="mt-1 font-medium">{contract.uploadedByName}</dd></div>
            <div><dt className="text-xs text-fluent-neutral-60">Ημερομηνία / κείμενο</dt><dd className="mt-1 font-medium">{formatDate(contract.createdAt)} · {contract.charCount.toLocaleString('el-GR')} χαρακτήρες</dd></div>
          </dl>
        ) : (
          <p className="mt-4 rounded-lg bg-fluent-neutral-4 p-4 text-sm text-fluent-neutral-70">
            {canUpload ? 'Δεν έχει ανέβει σύμβαση. Επίλεξε PDF ή DOCX με επιλέξιμο κείμενο, έως 20 MB.' : 'Δεν έχει ανέβει σύμβαση από τον δημιουργό του έργου.'}
          </p>
        )}
        <div aria-live="polite">
          {message && <p className="mt-3 text-sm text-fluent-accent-green">{message}</p>}
          {error && <p role="alert" className="mt-3 text-sm text-fluent-accent-red">{error}</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-fluent-2">
        <div className="border-b border-black/5 px-5 py-4">
          <h3 className="font-semibold text-fluent-neutral-90">Κάλυψη εργασιών</h3>
          <p className="mt-1 text-xs text-fluent-neutral-60">Ο έλεγχος γίνεται ανά εργασία με βάση την τρέχουσα σύμβαση.</p>
        </div>
        {!contract ? <p className="p-5 text-sm text-fluent-neutral-60">Το ανέβασμα σύμβασης είναι προϋπόθεση για τον έλεγχο.</p> : (
          <div className="divide-y divide-black/5">
            {tasks.map((task) => (
              <article key={task.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-fluent-neutral-90">{task.title}</h4>
                      <Badge variant="neutral">{statusLabel(task.status)}</Badge>
                      {task.check && <Badge variant={task.check.coverage === 'covered' ? 'green' : task.check.coverage === 'not_found' ? 'red' : 'orange'}>{COVERAGE_LABEL[task.check.coverage]}</Badge>}
                    </div>
                    {task.check && (
                      <div className="mt-3 space-y-2 text-sm leading-6">
                        <p className="text-fluent-neutral-80">{task.check.explanation}</p>
                        <p className="text-xs text-fluent-neutral-60">Βεβαιότητα μοντέλου: {Math.round(task.check.confidence * 100)}% · {formatDate(task.check.createdAt)}</p>
                        {task.check.evidence && <blockquote className="border-l-2 border-fluent-blue-300 bg-fluent-blue-50/40 px-3 py-2 text-fluent-neutral-70">«{task.check.evidence}»</blockquote>}
                      </div>
                    )}
                  </div>
                  {canCheck && (
                    <Button type="button" size="sm" variant="secondary" disabled={checkingId !== null} icon={task.check ? <Checkmark20Regular /> : <DocumentSearch20Regular />} onClick={() => check(task.id)}>
                      {checkingId === task.id ? 'Έλεγχος…' : task.check ? 'Νέος έλεγχος' : 'Έλεγχος κάλυψης'}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
