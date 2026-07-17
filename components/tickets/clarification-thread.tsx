'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestClarification } from '@/app/(app)/tickets/followup-actions'

export type ThreadMessage = { id: string; direction: string; body: string; createdAt: string | Date }

export function ThreadList({ messages }: { messages: ThreadMessage[] }) {
  if (messages.length === 0) return null
  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <div key={m.id} className={`max-w-[85%] rounded-lg p-3 text-sm ${m.direction === 'outbound' ? 'ml-auto bg-fluent-blue-600/10' : 'bg-black/5'}`}>
          <p className="mb-1 text-[11px] font-semibold text-fluent-neutral-60">
            {m.direction === 'outbound' ? 'Ομάδα' : 'Πελάτης'} · {new Date(m.createdAt).toLocaleString('el-GR')}
          </p>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
    </div>
  )
}

export function ClarificationBox({ ticketId, disabled }: { ticketId: string; disabled?: boolean }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const send = () =>
    startTransition(async () => {
      setError(null)
      const res = await requestClarification({ ticketId, message: text })
      if (res.ok) { setText(''); router.refresh() } else setError(res.error)
    })

  return (
    <div className="space-y-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} rows={3}
        placeholder="Τι θέλετε να ρωτήσετε τον πελάτη;"
        className="w-full rounded-md border border-neutral-300 p-2.5 text-sm focus:border-fluent-blue-500 focus:outline-none" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="button" onClick={send} disabled={pending || disabled || text.trim().length < 5}
        className="rounded-md bg-fluent-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50">
        {pending ? 'Αποστολή…' : 'Ζητήστε διευκρίνιση'}
      </button>
    </div>
  )
}
