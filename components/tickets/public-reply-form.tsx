'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PublicReplyForm({ code, token }: { code: string; token: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    const res = await fetch(`/api/tickets/${code}/reply?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (res.ok) {
      setState('sent'); setBody(''); router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error === 'rate_limited' ? 'Πολλές απαντήσεις — δοκιμάστε αργότερα.' : 'Η αποστολή απέτυχε — δοκιμάστε ξανά.')
      setState('error')
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <textarea
        value={body} onChange={(e) => setBody(e.target.value)} required maxLength={3000} rows={4}
        placeholder="Γράψτε την απάντησή σας…"
        className="w-full rounded-lg border border-neutral-200 p-3 text-sm focus:border-[#0078d4] focus:outline-none"
      />
      {state === 'error' && <p className="text-sm text-[#a4262c]">{error}</p>}
      {state === 'sent' && <p className="text-sm text-[#0f7b0f]">Η απάντησή σας καταχωρήθηκε — ευχαριστούμε.</p>}
      <button type="submit" disabled={state === 'sending' || !body.trim()}
        className="rounded-lg bg-[#0078d4] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {state === 'sending' ? 'Αποστολή…' : 'Αποστολή απάντησης'}
      </button>
    </form>
  )
}
