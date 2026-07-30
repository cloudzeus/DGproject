'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '@/lib/notifications/actions'
import { NotificationGlyph, relativeTimeGr } from '@/components/portal/notification-glyph'
import { cn } from '@/lib/utils'

/**
 * Το ιστορικό ειδοποιήσεων, ομαδοποιημένο ανά ημέρα.
 *
 * Η ομαδοποίηση δεν είναι διακόσμηση: χωρίς αυτήν, μια λίστα 100 γραμμών με
 * σχετικούς χρόνους («πριν 3 μέρες») δεν αφήνει τον αναγνώστη να καταλάβει τι
 * συνέβη μαζί. Οι κεφαλίδες ημέρας δίνουν το ρυθμό που λείπει.
 */

const FILTERS = [
  { key: 'all', label: 'Όλες' },
  { key: 'unread', label: 'Αδιάβαστες' },
  { key: 'meeting', label: 'Πρακτικά' },
  { key: 'ticket', label: 'Αιτήματα' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Σήμερα'
  if (same(d, yesterday)) return 'Χθες'

  return new Intl.DateTimeFormat('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
}

export function PortalNotificationList({ items: initial }: { items: NotificationRow[] }) {
  const [items, setItems] = useState(initial)
  const [filter, setFilter] = useState<FilterKey>('all')
  const router = useRouter()

  const unread = items.filter((n) => !n.read).length

  const visible = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'unread') return items.filter((n) => !n.read)
    return items.filter((n) => n.type === filter)
  }, [items, filter])

  const groups = useMemo(() => {
    const map = new Map<string, NotificationRow[]>()
    for (const n of visible) {
      const key = dayLabel(n.createdAt)
      const bucket = map.get(key)
      if (bucket) bucket.push(n)
      else map.set(key, [n])
    }
    return [...map.entries()]
  }, [visible])

  function open(n: NotificationRow) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      void markNotificationRead(n.id)
    }
    if (n.link) router.push(n.link)
  }

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    await markAllNotificationsRead()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key
            const count =
              f.key === 'unread'
                ? unread
                : f.key === 'all'
                  ? items.length
                  : items.filter((n) => n.type === f.key).length

            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'bg-fluent-blue-50 text-fluent-blue-700'
                    : 'text-fluent-neutral-70 hover:bg-black/5',
                )}
              >
                {f.label}
                <span className="tabular-nums text-fluent-neutral-50">{count}</span>
              </button>
            )
          })}
        </div>

        {unread > 0 && (
          <button
            type="button"
            onClick={markAll}
            className="text-xs font-medium text-fluent-blue-600 hover:underline"
          >
            Σήμανση όλων ως διαβασμένων
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-fluent-neutral-80">
            {filter === 'all' ? 'Καμία ειδοποίηση ακόμα' : 'Τίποτα σε αυτό το φίλτρο'}
          </p>
          <p className="mt-1 text-xs text-fluent-neutral-60">
            Θα ενημερωθείτε εδώ για ολοκληρωμένες εργασίες, νέα αρχεία, πρακτικά συσκέψεων
            και απαντήσεις σε αιτήματα.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, rows]) => (
            <section key={day}>
              <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                {day}
              </h2>
              <div className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
                {rows.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => open(n)}
                    disabled={!n.link}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150',
                      n.link
                        ? 'hover:bg-fluent-neutral-4 focus-visible:bg-fluent-neutral-4'
                        : 'cursor-default',
                      !n.read && 'bg-fluent-blue-50/40',
                      'focus-visible:outline-none',
                    )}
                  >
                    <NotificationGlyph type={n.type} />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fluent-neutral-90">
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-fluent-neutral-50">
                          {relativeTimeGr(n.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-fluent-neutral-70">
                        {n.message}
                      </span>
                    </span>

                    {!n.read && (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-fluent-blue-600"
                        aria-label="Αδιάβαστη"
                      />
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
