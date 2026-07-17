'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renameHelpCategory, deleteHelpCategory } from './actions'

// Chips list for dynamic help-center categories — rename via prompt(), delete via confirm().
export function CategoryManager({ categories }: { categories: { id: string; name: string; count: number }[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (categories.length === 0) return null

  const rename = (id: string, current: string) => {
    const name = prompt('Νέο όνομα κατηγορίας:', current)
    if (!name || name.trim() === current) return
    startTransition(async () => {
      setError(null)
      const res = await renameHelpCategory({ id, name })
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  const remove = (id: string, name: string, count: number) => {
    if (!confirm(`Διαγραφή κατηγορίας «${name}»; ${count > 0 ? `Οι ${count} εγγραφές της θα μείνουν χωρίς κατηγορία.` : ''}`)) return
    startTransition(async () => {
      setError(null)
      const res = await deleteHelpCategory(id)
      if (!res.ok) setError('Η διαγραφή απέτυχε.')
      else router.refresh()
    })
  }

  return (
    <div className="mb-4 rounded-lg border border-black/5 bg-white shadow-fluent-2 p-4">
      <h2 className="text-xs font-semibold text-fluent-neutral-60 mb-2">Κατηγορίες help center</h2>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-fluent-neutral-10 px-3 py-1 text-xs text-fluent-neutral-90"
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-fluent-neutral-60">({c.count})</span>
            <button
              type="button"
              onClick={() => rename(c.id, c.name)}
              disabled={pending}
              title="Μετονομασία"
              className="text-fluent-neutral-60 hover:text-fluent-blue-600 disabled:opacity-50"
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={() => remove(c.id, c.name, c.count)}
              disabled={pending}
              title="Διαγραφή"
              className="text-fluent-neutral-60 hover:text-red-600 disabled:opacity-50"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
