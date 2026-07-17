import { prisma } from '@/lib/prisma'
import { type ReportScope, bucketByDay, bucketByWeek, hoursBetween, mean, median } from './shared'

export type TicketsReport = {
  volume: {
    total: number
    bySource: { label: string; value: number }[]
    byCategory: { label: string; value: number }[]
    byStatusGroup: { key: string; value: number }[] // keys από TICKET_STATUS_GROUPS
    incomingByDay: { day: string; value: number }[]
  }
  times: {
    toTriage: { mean: number | null; median: number | null; n: number }
    toConvert: { mean: number | null; median: number | null; n: number }
    toResolve: { mean: number | null; median: number | null; n: number }
    resolutionByWeek: { week: string; count: number }[] // επιλύσεις/εβδομάδα
  }
  ai: {
    avgConfidence: number | null
    confidenceBuckets: { label: string; value: number }[]
    rejectedPct: number
    mergedPct: number
    needsInfoPct: number
    errors: number
    convertedTotal: number
    acceptedSuggestion: number // converted με task στο προτεινόμενο project
  }
  reporters: { email: string; name: string | null; count: number; topCategory: string | null }[]
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Σφάλμα', feature: 'Νέα λειτουργία', support: 'Υποστήριξη',
  question: 'Ερώτηση', billing: 'Χρέωση', other: 'Άλλο',
}

export async function buildTicketsReport(scope: ReportScope): Promise<TicketsReport> {
  const { range } = scope

  const tickets = await prisma.ticket.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    select: {
      id: true, createdAt: true, resolvedAt: true, status: true,
      reporterEmail: true, reporterName: true, aiCategory: true, aiConfidence: true, aiError: true,
      aiSuggestedProjectId: true,
      source: { select: { name: true } },
      task: { select: { projectId: true } },
      events: {
        where: { type: { in: ['analyzed', 'converted'] } },
        orderBy: { createdAt: 'asc' },
        select: { type: true, createdAt: true },
      },
    },
  })

  const notMerged = tickets.filter((t) => t.status !== 'merged')

  const count = <T,>(rows: T[], key: (r: T) => string): { label: string; value: number }[] => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }

  const statusGroupOf = (s: string): string => {
    if (s === 'new' || s === 'analyzing') return 'open'
    if (s === 'triaged') return 'triaged'
    if (s === 'converted') return 'converted'
    if (s === 'needs_info') return 'needs_info'
    if (s === 'resolved' || s === 'closed') return 'resolved'
    return 'other'
  }

  const durations = (type: 'analyzed' | 'converted') =>
    notMerged
      .map((t) => {
        const ev = t.events.find((e) => e.type === type)
        return ev ? hoursBetween(t.createdAt, ev.createdAt) : null
      })
      .filter((v): v is number => v !== null)

  const toTriage = durations('analyzed')
  const toConvert = durations('converted')
  const toResolve = notMerged.filter((t) => t.resolvedAt).map((t) => hoursBetween(t.createdAt, t.resolvedAt!))
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)

  const withConf = notMerged.filter((t) => t.aiConfidence !== null)
  const confBucket = (c: number) => (c < 0.6 ? '<60%' : c < 0.85 ? '60–85%' : '≥85%')
  const confCounts = new Map<string, number>([['<60%', 0], ['60–85%', 0], ['≥85%', 0]])
  for (const t of withConf) confCounts.set(confBucket(t.aiConfidence!), (confCounts.get(confBucket(t.aiConfidence!)) ?? 0) + 1)

  const converted = tickets.filter((t) => t.task)
  const accepted = converted.filter((t) => t.aiSuggestedProjectId && t.task!.projectId === t.aiSuggestedProjectId)

  const byReporter = new Map<string, { name: string | null; count: number; cats: Map<string, number> }>()
  for (const t of tickets) {
    const e = byReporter.get(t.reporterEmail) ?? { name: t.reporterName, count: 0, cats: new Map() }
    e.count += 1
    if (t.aiCategory) e.cats.set(t.aiCategory, (e.cats.get(t.aiCategory) ?? 0) + 1)
    byReporter.set(t.reporterEmail, e)
  }
  const reporters = [...byReporter.entries()]
    .map(([email, e]) => ({
      email,
      name: e.name,
      count: e.count,
      topCategory: [...e.cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        ? CATEGORY_LABEL[[...e.cats.entries()].sort((a, b) => b[1] - a[1])[0][0]]
        : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const pct = (n: number) => (tickets.length === 0 ? 0 : Math.round((n / tickets.length) * 100))

  return {
    volume: {
      total: tickets.length,
      bySource: count(tickets, (t) => t.source.name),
      byCategory: count(tickets.filter((t) => t.aiCategory), (t) => CATEGORY_LABEL[t.aiCategory!] ?? t.aiCategory!),
      byStatusGroup: count(tickets, (t) => statusGroupOf(t.status)).map((c) => ({ key: c.label, value: c.value })),
      incomingByDay: bucketByDay(tickets, (t) => t.createdAt, range).map((d) => ({ day: d.day, value: d.count })),
    },
    times: {
      toTriage: { mean: r1(mean(toTriage)), median: r1(median(toTriage)), n: toTriage.length },
      toConvert: { mean: r1(mean(toConvert)), median: r1(median(toConvert)), n: toConvert.length },
      toResolve: { mean: r1(mean(toResolve)), median: r1(median(toResolve)), n: toResolve.length },
      resolutionByWeek: bucketByWeek(notMerged.filter((t) => t.resolvedAt), (t) => t.resolvedAt!, range),
    },
    ai: {
      avgConfidence: withConf.length === 0 ? null : Math.round((mean(withConf.map((t) => t.aiConfidence!))! * 100)),
      confidenceBuckets: [...confCounts.entries()].map(([label, value]) => ({ label, value })),
      rejectedPct: pct(tickets.filter((t) => t.status === 'rejected').length),
      mergedPct: pct(tickets.filter((t) => t.status === 'merged').length),
      needsInfoPct: pct(tickets.filter((t) => t.status === 'needs_info').length),
      errors: tickets.filter((t) => t.aiError).length,
      convertedTotal: converted.length,
      acceptedSuggestion: accepted.length,
    },
    reporters,
  }
}
