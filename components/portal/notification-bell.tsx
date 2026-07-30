'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '@/lib/notifications/actions'
import { NotificationGlyph, relativeTimeGr } from './notification-glyph'

/**
 * Καμπανάκι ειδοποιήσεων του portal.
 *
 * Ζει στο header και όχι στο nav: ο αριθμός αδιάβαστων πρέπει να φαίνεται από
 * κάθε σελίδα, ενώ ένα nav item θα τον έδειχνε μόνο ως ακόμα έναν προορισμό.
 *
 * ΔΕΝ χρησιμοποιεί το `useDismissable`: αυτό κλειδώνει το scroll του body, που
 * είναι σωστό για modal και λάθος για flyout — ο χρήστης πρέπει να μπορεί να
 * κυλήσει τη σελίδα με το πάνελ ανοιχτό. Κρατάμε μόνο το Escape, και προσθέτουμε
 * κλείσιμο με κλικ έξω, που τα modals δεν το χρειάζονται.
 */
export function PortalNotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    const res = await fetchMyNotifications(12)
    setItems(res.items)
    setUnread(res.unread)
  }, [])

  // Αρχική φόρτωση + poll ανά 60s, ίδιος ρυθμός με το topbar της ομάδας.
  useEffect(() => {
    let cancelled = false
    async function tick() {
      const res = await fetchMyNotifications(12)
      if (!cancelled) {
        setItems(res.items)
        setUnread(res.unread)
      }
    }
    tick()
    const interval = setInterval(tick, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function handleOpen() {
    const next = !open
    setOpen(next)
    if (next) void load()
  }

  /**
   * Αισιόδοξη ενημέρωση: ο μετρητής πέφτει αμέσως και το write φεύγει στο
   * παρασκήνιο. Η πλοήγηση δεν περιμένει το δίκτυο — αλλιώς το κλικ θα έμοιαζε
   * νεκρό για ένα round-trip.
   */
  function handleClick(n: NotificationRow) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      setUnread((u) => Math.max(0, u - 1))
      void markNotificationRead(n.id)
    }
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  async function handleMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
    await markAllNotificationsRead()
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={unread > 0 ? `Ειδοποιήσεις, ${unread} αδιάβαστες` : 'Ειδοποιήσεις'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-fluent-neutral-80 transition-colors duration-150 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue-500"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M10 3a5 5 0 0 0-5 5v3l-1.5 2.5h13L15 11V8a5 5 0 0 0-5-5Zm-2 11a2 2 0 0 0 4 0" />
        </svg>

        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fluent-accent-red px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ειδοποιήσεις"
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-28"
        >
          <div className="flex items-center justify-between gap-3 border-b border-fluent-neutral-10 px-4 py-2.5">
            <p className="font-display text-sm font-semibold text-fluent-neutral-90">
              Ειδοποιήσεις
              {unread > 0 && <span className="ml-1 text-fluent-blue-600">({unread})</span>}
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-fluent-blue-600 transition-colors hover:bg-fluent-blue-50"
              >
                Όλα ως διαβασμένα
              </button>
            )}
          </div>

          <div className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-fluent-neutral-80">Καμία ειδοποίηση</p>
                <p className="mt-1 text-xs text-fluent-neutral-60">
                  Θα ενημερωθείτε εδώ για κάθε εξέλιξη στα έργα σας.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-black/5">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-fluent-neutral-4 focus-visible:outline-none focus-visible:bg-fluent-neutral-4 ${
                        n.read ? '' : 'bg-fluent-blue-50/40'
                      }`}
                    >
                      <NotificationGlyph type={n.type} />

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fluent-neutral-90">
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-fluent-neutral-50">
                            {relativeTimeGr(n.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-fluent-neutral-70">
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
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-fluent-neutral-10 bg-fluent-neutral-4 px-4 py-2">
            <Link
              href="/portal/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-fluent-blue-600 hover:underline"
            >
              Όλες οι ειδοποιήσεις
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
