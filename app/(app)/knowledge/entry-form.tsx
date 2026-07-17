'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketCategory } from '@prisma/client'
import { createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry } from './actions'

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'bug', label: '🐞 Σφάλμα' },
  { value: 'feature', label: '✨ Νέα λειτουργία' },
  { value: 'support', label: '🛟 Υποστήριξη' },
  { value: 'question', label: '❓ Ερώτηση' },
  { value: 'billing', label: '💶 Χρέωση' },
  { value: 'other', label: '📋 Άλλο' },
]

export type EntryFormValue = {
  id?: string
  title: string
  problem: string
  solution: string
  tags: string[]
  category: TicketCategory | null
  projectId: string | null
  sourceId: string | null
  isPublic: boolean
  helpCategoryId: string | null
}

export function EntryForm({ initial, sources, projects, helpCategories, canDelete }: {
  initial: EntryFormValue
  sources: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  helpCategories: { id: string; name: string }[]
  canDelete: boolean
}) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [tagsText, setTagsText] = useState(initial.tags.join(', '))
  // Help-center category select: '' = none, existing id, or '__new__' (free text).
  const [helpCat, setHelpCat] = useState(initial.helpCategoryId ?? '')
  const [newCatName, setNewCatName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      setError(null)
      const payload = {
        ...v,
        tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        helpCategoryId: helpCat && helpCat !== '__new__' ? helpCat : null,
        newCategoryName: helpCat === '__new__' ? newCatName.trim() || null : null,
      }
      const res = v.id
        ? await updateKnowledgeEntry({ ...payload, id: v.id })
        : await createKnowledgeEntry(payload)
      if (!res.ok) return setError(res.error)
      router.push('/knowledge')
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      if (!v.id || !confirm('Διαγραφή εγγραφής;')) return
      await deleteKnowledgeEntry(v.id)
      router.push('/knowledge')
      router.refresh()
    })

  return (
    <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5 max-w-2xl">
      <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Τίτλος</label>
      <input
        value={v.title}
        maxLength={190}
        onChange={(e) => setV({ ...v, title: e.target.value })}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Πρόβλημα</label>
      <textarea
        value={v.problem}
        rows={4}
        onChange={(e) => setV({ ...v, problem: e.target.value })}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Λύση</label>
      <textarea
        value={v.solution}
        rows={8}
        onChange={(e) => setV({ ...v, solution: e.target.value })}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <label className="mt-3 block text-xs font-semibold text-fluent-neutral-60 mb-1">Tags (χωρισμένα με κόμμα)</label>
      <input
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Πηγή</label>
          <select
            value={v.sourceId ?? ''}
            onChange={(e) => setV({ ...v, sourceId: e.target.value || null })}
            className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
          >
            <option value="">Χωρίς πηγή</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Έργο</label>
          <select
            value={v.projectId ?? ''}
            onChange={(e) => setV({ ...v, projectId: e.target.value || null })}
            className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
          >
            <option value="">Χωρίς έργο</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Κατηγορία</label>
          <select
            value={v.category ?? ''}
            onChange={(e) => setV({ ...v, category: (e.target.value || null) as TicketCategory | null })}
            className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
          >
            <option value="">Χωρίς κατηγορία</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs font-semibold text-fluent-neutral-60 mb-1">Κατηγορία help center</label>
        <select
          value={helpCat}
          onChange={(e) => setHelpCat(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm sm:max-w-xs"
        >
          <option value="">Καμία</option>
          {helpCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__new__">➕ Νέα κατηγορία…</option>
        </select>
        {helpCat === '__new__' && (
          <input
            value={newCatName}
            maxLength={80}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Όνομα νέας κατηγορίας"
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:max-w-xs"
          />
        )}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-fluent-neutral-90">
        <input
          type="checkbox"
          checked={v.isPublic}
          onChange={(e) => setV({ ...v, isPublic: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Δημόσιο — εμφανίζεται στο help center της πηγής
      </label>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-fluent-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fluent-blue-700 disabled:opacity-50"
        >
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
        {canDelete && v.id && (
          <button
            onClick={remove}
            disabled={pending}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Διαγραφή
          </button>
        )}
      </div>
    </div>
  )
}
