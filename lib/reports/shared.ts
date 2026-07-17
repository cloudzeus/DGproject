// Καθαρά helpers + κοινοί τύποι για τα report builders. ΟΧΙ Prisma imports εδώ —
// ό,τι μπαίνει σε αυτό το αρχείο πρέπει να τρέχει και στο scripts/test-reports-helpers.ts.

export type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'mtd'
export type DateRange = { from: Date; to: Date }
export type ResolvedPeriod = { range: DateRange; prev: DateRange; preset: PeriodPreset | 'custom' }

export type ReportScope = {
  range: DateRange
  prev: DateRange
  userId: string
  isPrivileged: boolean
}

const DAY = 86_400_000
const MAX_CUSTOM_DAYS = 366

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/**
 * URL params → τρέχουσα + προηγούμενη περίοδος (ίδιας διάρκειας, ακριβώς πριν).
 * Invalid/απόντα params → fallback '30d'. Custom range clamped στις 366 ημέρες.
 */
export function resolveRange(
  params: { period?: string; from?: string; to?: string },
  now: Date = new Date(),
): ResolvedPeriod {
  if (params.from && params.to) {
    const fromRaw = new Date(params.from)
    const toRaw = new Date(params.to)
    if (!Number.isNaN(fromRaw.getTime()) && !Number.isNaN(toRaw.getTime()) && toRaw >= fromRaw) {
      const to = endOfDay(toRaw)
      let from = startOfDay(fromRaw)
      if (to.getTime() - from.getTime() > MAX_CUSTOM_DAYS * DAY) {
        from = startOfDay(new Date(to.getTime() - (MAX_CUSTOM_DAYS - 1) * DAY))
      }
      const span = to.getTime() - from.getTime()
      return {
        range: { from, to },
        prev: { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) },
        preset: 'custom',
      }
    }
  }
  const preset: PeriodPreset =
    params.period === 'today' || params.period === '7d' || params.period === '90d' || params.period === 'mtd'
      ? params.period
      : '30d'
  let from: Date
  switch (preset) {
    case 'today': from = startOfDay(now); break
    case '7d': from = startOfDay(new Date(now.getTime() - 6 * DAY)); break
    case '90d': from = startOfDay(new Date(now.getTime() - 89 * DAY)); break
    case 'mtd': from = new Date(now.getFullYear(), now.getMonth(), 1); break
    default: from = startOfDay(new Date(now.getTime() - 29 * DAY))
  }
  const to = endOfDay(now)
  const span = to.getTime() - from.getTime()
  return {
    range: { from, to },
    prev: { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) },
    preset,
  }
}

/** 'YYYY-MM-DD' με τοπική ώρα (τα γραφήματα δουλεύουν σε τοπικές ημέρες). */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Όλες οι ημέρες της περιόδου, inclusive, ως keys. */
export function dayKeys(range: DateRange): string[] {
  const keys: string[] = []
  for (let t = startOfDay(range.from).getTime(); t <= range.to.getTime(); t += DAY) {
    keys.push(dayKey(new Date(t)))
  }
  // Το fall-back DST (25ωρη τοπική ημέρα) παράγει διπλό key μία φορά τον χρόνο.
  return [...new Set(keys)]
}

/** Μετράει rows ανά ημέρα πάνω σε ΟΛΕΣ τις ημέρες της περιόδου (μηδενικά όπου λείπουν). */
export function bucketByDay<T>(rows: T[], getDate: (r: T) => Date, range: DateRange): { day: string; count: number }[] {
  const counts = new Map<string, number>(dayKeys(range).map((k) => [k, 0]))
  for (const r of rows) {
    const k = dayKey(getDate(r))
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].map(([day, count]) => ({ day, count }))
}

/** Δευτέρα της εβδομάδας του d, ως key 'YYYY-MM-DD'. */
export function weekKey(d: Date): string {
  const x = startOfDay(d)
  const dow = (x.getDay() + 6) % 7 // Δευτέρα=0
  x.setDate(x.getDate() - dow)
  return dayKey(x)
}

export function bucketByWeek<T>(rows: T[], getDate: (r: T) => Date, range: DateRange): { week: string; count: number }[] {
  const weeks = new Map<string, number>()
  for (const k of dayKeys(range)) {
    const w = weekKey(new Date(`${k}T12:00:00`))
    if (!weeks.has(w)) weeks.set(w, 0)
  }
  for (const r of rows) {
    const w = weekKey(getDate(r))
    if (weeks.has(w)) weeks.set(w, (weeks.get(w) ?? 0) + 1)
  }
  return [...weeks.entries()].map(([week, count]) => ({ week, count }))
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function mean(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function msToHours(ms: bigint | number): number {
  return Math.round((Number(ms) / 3_600_000) * 10) / 10
}

export function hoursBetween(a: Date, b: Date): number {
  return Math.round(((b.getTime() - a.getTime()) / 3_600_000) * 10) / 10
}

/** % μεταβολή vs προηγούμενη περίοδο. null όταν prev=0 (δεν ορίζεται ποσοστό). */
export function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}

/**
 * Συνολικός tracked χρόνος (ms) ενός task: accumulated + τρέχον ανοιχτό διάστημα
 * όσο είναι in_progress. Βλ. σχόλιο στο Task model (prisma/schema.prisma).
 */
export function trackedMs(
  t: { inProgressAccumulatedMs: bigint; inProgressStartedAt: Date | null; status: string },
  now: Date = new Date(),
): number {
  const base = Number(t.inProgressAccumulatedMs)
  if (t.status === 'in_progress' && t.inProgressStartedAt) {
    return base + Math.max(0, now.getTime() - t.inProgressStartedAt.getTime())
  }
  return base
}

/** Buckets κατανομής cycle time σε ημέρες. Σειρά σταθερή για τα charts. */
export const CYCLE_BUCKETS = ['<1μ', '1–3μ', '3–7μ', '7–14μ', '>14μ'] as const
export function cycleBucket(hours: number): (typeof CYCLE_BUCKETS)[number] {
  const d = hours / 24
  if (d < 1) return '<1μ'
  if (d < 3) return '1–3μ'
  if (d < 7) return '3–7μ'
  if (d < 14) return '7–14μ'
  return '>14μ'
}

// ─── Labels (μεταφέρθηκαν από το παλιό lib/reports.ts — ΜΗΝ αλλάξεις τιμές) ───

export const STATUS_LABELS_EL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Προς έλεγχο',
  done: 'Ολοκληρωμένο',
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
}

export const PRIORITY_LABELS_EL: Record<string, string> = {
  low: 'Χαμηλή',
  medium: 'Μεσαία',
  high: 'Υψηλή',
  urgent: 'Επείγουσα',
}

export const ROLE_LABELS_EL: Record<string, string> = {
  admin: 'Διαχειριστής',
  manager: 'Διευθυντής',
  member: 'Μέλος',
  viewer: 'Προβολή',
}

/** Λεκτικό περιόδου για τον header, π.χ. «1 Ιουλ – 17 Ιουλ 2026». */
export function rangeLabel(range: DateRange): string {
  const fmt = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
  const fmtShort = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' })
  const sameYear = range.from.getFullYear() === range.to.getFullYear()
  return `${(sameYear ? fmtShort : fmt).format(range.from)} – ${fmt.format(range.to)}`
}
