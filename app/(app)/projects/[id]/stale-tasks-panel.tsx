'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { isStaleOpenTask } from '@/lib/task-lifecycle'
import { bulkResolveStaleTasks } from './stale-task-actions'
import type { TaskRow } from './task-views'

export function StaleTasksPanel({ projectId, tasks }: { projectId: string; tasks: TaskRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hours, setHours] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const stale = useMemo(() => tasks.filter((task) => task.createdAt && isStaleOpenTask({ createdAt: task.createdAt, status: task.status })), [tasks])

  if (stale.length === 0) return null

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function resolve(action: 'done' | 'cancelled') {
    const chosen = stale.filter((task) => selected.has(task.id))
    if (chosen.length === 0) { setMessage('Επίλεξε τουλάχιστον μία εργασία.'); return }
    const verb = action === 'done' ? 'ολοκληρωθούν' : 'ακυρωθούν'
    if (!window.confirm(`Να ${verb} ${chosen.length} εργασίες; Η ενέργεια θα καταγραφεί στο ιστορικό.`)) return
    setMessage(null)
    startTransition(async () => {
      const result = await bulkResolveStaleTasks(projectId, chosen.map((task) => ({ id: task.id, billableHours: hours[task.id] || null })), action)
      if (!result.ok) { setMessage(result.error ?? 'Η ενέργεια απέτυχε.'); return }
      setSelected(new Set())
      setMessage(`${result.count} εργασίες ενημερώθηκαν.`)
      router.refresh()
    })
  }

  return (
    <section className="border-b border-black/5 bg-fluent-neutral-4 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fluent-neutral-90">Ανοιχτές εργασίες 30+ ημερών ({stale.length})</h3>
          <p className="mt-0.5 text-xs text-fluent-neutral-60">Μαζική ολοκλήρωση ή μη καταστροφική ακύρωση, με πλήρες ιστορικό.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? 'Απόκρυψη' : 'Διαχείριση'}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.size === stale.length}
              onChange={(event) => setSelected(event.target.checked ? new Set(stale.map((task) => task.id)) : new Set())}
            />
            Επιλογή όλων
          </label>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {stale.map((task) => {
              const age = task.createdAt ? Math.floor((Date.now() - task.createdAt.getTime()) / 86_400_000) : 0
              return (
                <div key={task.id} className="grid gap-3 rounded-lg border border-black/5 bg-white p-3 md:grid-cols-[minmax(0,1fr)_190px] md:items-center">
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.has(task.id)} onChange={() => toggle(task.id)} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fluent-neutral-90">{task.title}</span>
                      <span className="mt-1 block text-xs text-fluent-neutral-60">Δημιουργία: {formatDate(task.createdAt ?? undefined)} · {age} ημέρες</span>
                    </span>
                  </label>
                  <label className="text-xs font-medium text-fluent-neutral-70">
                    Χρεώσιμες ώρες (προαιρετικό)
                    <input
                      type="number" min="0" step="0.25" value={hours[task.id] ?? ''}
                      onChange={(event) => setHours((current) => ({ ...current, [task.id]: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-md border border-fluent-neutral-20 px-3 text-sm focus:border-fluent-blue-500 focus:outline-none"
                      placeholder="π.χ. 4.5"
                    />
                  </label>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-fluent-neutral-70">{message ?? `${selected.size} επιλεγμένες`}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={pending || selected.size === 0} onClick={() => resolve('cancelled')}>Ακύρωση επιλεγμένων</Button>
              <Button type="button" variant="primary" disabled={pending || selected.size === 0} onClick={() => resolve('done')}>{pending ? 'Ενημέρωση…' : 'Ολοκλήρωση επιλεγμένων'}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
