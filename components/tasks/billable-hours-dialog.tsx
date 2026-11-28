'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatSpent } from '@/lib/task-in-progress-timer'

export function BillableHoursDialog({
  taskTitle,
  billableHours,
  spentMs,
  pending,
  onCancel,
  onConfirm,
}: {
  taskTitle: string
  billableHours: number | null
  spentMs?: number
  pending?: boolean
  onCancel: () => void
  onConfirm: (hours: number | null) => void
}) {
  const [value, setValue] = useState(billableHours?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const normalized = value.trim().replace(',', '.')
    const hours = normalized === '' ? null : Number(normalized)
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      setError('Καταχώρισε μη αρνητικό αριθμό ωρών ή άφησε το πεδίο κενό.')
      return
    }
    onConfirm(hours)
  }

  return (
    <Modal
      title="Χρεώσιμες ώρες πελάτη"
      description={taskTitle}
      onClose={pending ? () => {} : onCancel}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-fluent-neutral-70">
          Καταχώρισε προαιρετικά τις ώρες που θα χρεωθούν στον πελάτη. Δεν αλλάζουν τον χρόνο εργασίας της ομάδας.
        </p>
        {spentMs !== undefined && spentMs > 0 && (
          <p className="text-xs text-fluent-neutral-60">Καταγεγραμμένος χρόνος «Σε εξέλιξη»: {formatSpent(spentMs)}</p>
        )}
        <label className="block text-xs font-medium text-fluent-neutral-70">
          Χρεώσιμες ώρες
          <input
            autoFocus
            type="number"
            min="0"
            step="0.25"
            value={value}
            disabled={pending}
            onChange={(event) => { setValue(event.target.value); setError(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
            className="mt-1 h-11 w-full rounded-md border border-fluent-neutral-20 bg-white px-3 text-sm focus:border-fluent-blue-500 focus:outline-none focus:ring-2 focus:ring-fluent-blue-100"
            placeholder="π.χ. 4.5"
          />
        </label>
        {error && <p role="alert" className="text-sm text-fluent-accent-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Ακύρωση</Button>
          <Button type="button" variant="primary" disabled={pending} onClick={submit}>
            {pending ? 'Ολοκλήρωση…' : 'Ολοκλήρωση εργασίας'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
