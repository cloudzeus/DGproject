'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTicketSource, updateTicketSource, rotateTicketSourceSecret } from './actions'

type SourceView = {
  id: string
  code: string
  name: string
  originUrls: string[]
  defaultProjectId: string | null
  defaultProjectName: string | null
  active: boolean
  ticketCount: number
}

type Props = {
  sources: SourceView[]
  projects: { id: string; name: string; projectCode: string | null }[]
}

export function TicketSourcesClient({ sources, projects }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<{ code: string; secret: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [origins, setOrigins] = useState('')
  const [defaultProjectId, setDefaultProjectId] = useState('')

  const create = () => {
    setError(null)
    startTransition(async () => {
      const res = await createTicketSource({
        code,
        name,
        originUrls: origins.split('\n').map((s) => s.trim()).filter(Boolean),
        defaultProjectId: defaultProjectId || null,
      })
      if (!res.ok) return setError(res.error)
      setRevealedSecret({ code: res.code, secret: res.secret })
      setShowCreate(false)
      setCode(''); setName(''); setOrigins(''); setDefaultProjectId('')
      router.refresh()
    })
  }

  const rotate = (id: string, srcCode: string) => {
    if (!confirm(`Νέο API key για την πηγή ${srcCode}; Το παλιό θα πάψει να ισχύει αμέσως.`)) return
    startTransition(async () => {
      const res = await rotateTicketSourceSecret(id)
      if (res.ok) setRevealedSecret({ code: srcCode, secret: res.secret })
      router.refresh()
    })
  }

  const toggleActive = (s: SourceView) => {
    startTransition(async () => {
      await updateTicketSource({
        id: s.id,
        name: s.name,
        originUrls: s.originUrls,
        defaultProjectId: s.defaultProjectId,
        active: !s.active,
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {revealedSecret && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            API key για την πηγή {revealedSecret.code} — εμφανίζεται ΜΟΝΟ τώρα, αντιγράψτε το:
          </p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-sm border border-amber-200">
            {revealedSecret.secret}
          </code>
          <button onClick={() => setRevealedSecret(null)} className="mt-2 text-xs text-amber-800 underline">
            Το αντέγραψα — απόκρυψη
          </button>
        </div>
      )}

      <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wider text-fluent-neutral-50">
              <th className="px-4 py-3 font-semibold">Κωδικός</th>
              <th className="px-4 py-3 font-semibold">Όνομα</th>
              <th className="px-4 py-3 font-semibold">Origins</th>
              <th className="px-4 py-3 font-semibold">Default έργο</th>
              <th className="px-4 py-3 font-semibold">Tickets</th>
              <th className="px-4 py-3 font-semibold">Ενεργή</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-fluent-neutral-50">Δεν υπάρχουν πηγές ακόμα.</td></tr>
            )}
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3 text-xs text-fluent-neutral-60 max-w-[200px]">
                  {s.originUrls.length ? s.originUrls.join(', ') : <em>όλα</em>}
                </td>
                <td className="px-4 py-3 text-xs">{s.defaultProjectName ?? '—'}</td>
                <td className="px-4 py-3 text-xs">{s.ticketCount}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(s)}
                    disabled={pending}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.active ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'}`}
                  >
                    {s.active ? 'Ναι' : 'Όχι'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => rotate(s.id, s.code)}
                    disabled={pending}
                    className="text-xs font-medium text-fluent-blue-600 hover:underline disabled:opacity-50"
                  >
                    Νέο key
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate ? (
        <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5 max-w-lg">
          <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-3">Νέα πηγή</h2>
          <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Κωδικός (π.χ. DGSHOP)</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono" />
          <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Όνομα</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Επιτρεπόμενα origins (ένα ανά γραμμή, κενό = όλα)</label>
          <textarea value={origins} onChange={(e) => setOrigins(e.target.value)} rows={3} placeholder="https://shop.example.gr" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono" />
          <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Προεπιλεγμένο έργο (προαιρετικά)</label>
          <select value={defaultProjectId} onChange={(e) => setDefaultProjectId(e.target.value)} className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm">
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectCode ? `${p.projectCode} · ` : ''}{p.name}</option>
            ))}
          </select>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={create} disabled={pending || !code || !name} className="rounded-md bg-fluent-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fluent-blue-700 disabled:opacity-50">
              Δημιουργία
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-black/5">
              Άκυρο
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)} className="rounded-md bg-fluent-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fluent-blue-700">
          + Νέα πηγή
        </button>
      )}
    </div>
  )
}
