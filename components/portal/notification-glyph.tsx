/**
 * Εικονίδιο και τόνος ανά τύπο ειδοποίησης.
 *
 * Χωριστό αρχείο επειδή το χρησιμοποιούν τρεις επιφάνειες — το καμπανάκι, η
 * σελίδα ιστορικού και η «Πρόσφατη δραστηριότητα» του dashboard — και μια
 * ειδοποίηση πρέπει να δείχνει ίδια και στις τρεις. Αν το mapping ζούσε μέσα σε
 * μία από αυτές, οι άλλες δύο θα το αντέγραφαν και θα ξέφευγαν.
 *
 * Ο τόνος βάφει ΜΟΝΟ το εικονίδιο, ποτέ το κείμενο: το μελάνι μένει πάντα
 * neutral token, ώστε η λίστα να διαβάζεται σαν λίστα και όχι σαν φανάρι.
 */

type Tone = { fg: string; bg: string }

const TONES: Record<string, Tone> = {
  meeting: { fg: 'text-fluent-accent-purple', bg: 'bg-[#8764B8]/10' },
  ticket: { fg: 'text-fluent-blue-600', bg: 'bg-fluent-blue-50' },
  status_change: { fg: 'text-fluent-accent-green', bg: 'bg-[#107C10]/10' },
  comment: { fg: 'text-fluent-blue-600', bg: 'bg-fluent-blue-50' },
  due_soon: { fg: 'text-fluent-accent-orange', bg: 'bg-[#D83B01]/10' },
  question: { fg: 'text-fluent-accent-orange', bg: 'bg-[#D83B01]/10' },
  answer: { fg: 'text-fluent-accent-green', bg: 'bg-[#107C10]/10' },
  approval: { fg: 'text-fluent-accent-green', bg: 'bg-[#107C10]/10' },
  assignment: { fg: 'text-fluent-blue-600', bg: 'bg-fluent-blue-50' },
  mention: { fg: 'text-fluent-blue-600', bg: 'bg-fluent-blue-50' },
}

const FALLBACK: Tone = { fg: 'text-fluent-neutral-60', bg: 'bg-fluent-neutral-8' }

/** Μονοπάτια SVG 20×20, stroke-based ώστε να ακολουθούν το currentColor. */
const PATHS: Record<string, string> = {
  meeting: 'M4 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm3-2v2m6-2v2M4 8h12',
  ticket: 'M3 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V7Z',
  status_change: 'm4 10 4 4 8-8',
  comment: 'M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3v-3a2 2 0 0 1-1-2V6Z',
  due_soon: 'M10 6v4l2.5 2.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  question: 'M7.5 7.5a2.5 2.5 0 1 1 3 2.45V12M10 15h.01',
  answer: 'M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3v-3a2 2 0 0 1-1-2V6Z',
  approval: 'm4 10 4 4 8-8',
  assignment: 'M7 4h6a1 1 0 0 1 1 1v11l-4-2-4 2V5a1 1 0 0 1 1-1Z',
  mention: 'M13 10a3 3 0 1 1-3-3m3 3v1.5a1.5 1.5 0 0 0 3 0V10a6 6 0 1 0-2.5 4.87',
}

export function NotificationGlyph({
  type,
  className = 'h-8 w-8',
}: {
  type: string
  className?: string
}) {
  const tone = TONES[type] ?? FALLBACK
  const path = PATHS[type] ?? PATHS.comment

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${tone.bg} ${className}`}
      aria-hidden
    >
      <svg
        className={`h-[18px] w-[18px] ${tone.fg}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </span>
  )
}

const rtf = new Intl.RelativeTimeFormat('el', { numeric: 'auto' })

/**
 * Σχετικός χρόνος στα ελληνικά. Πάνω από μια βδομάδα γυρίζει σε απόλυτη
 * ημερομηνία — το «πριν από 6 εβδομάδες» δεν λέει τίποτα χρήσιμο.
 */
export function relativeTimeGr(iso: string): string {
  const then = new Date(iso)
  const diffSec = Math.round((then.getTime() - Date.now()) / 1000)
  const abs = Math.abs(diffSec)

  if (abs < 60) return 'μόλις τώρα'
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 604_800) return rtf.format(Math.round(diffSec / 86_400), 'day')

  return new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' }).format(then)
}
