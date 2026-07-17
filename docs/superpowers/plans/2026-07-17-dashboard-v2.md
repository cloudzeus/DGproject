# Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Αντικατάσταση του dashboard με action-first όψη: Quick Actions + ⌘K, Attention Inbox, Η μέρα μου (live timers), Χωρητικότητα ομάδας (getUserLoads), Ραντάρ 7 ημερών, Παλμός.

**Architecture:** Server page συνθέτει αρθρωτά builders `lib/dashboard/*` (JSON-safe, pattern των lib/reports). Client zones ως ξεχωριστά components στο `app/(app)/dashboard/`. Επαναχρησιμοποίηση: KpiTile, BoardTaskModal, EmailComposerModal, EmailImportModal, ResolutionDialog, ProjectModal/ProjectForm, getUserLoads.

**Tech Stack:** Next.js App Router, Prisma/MySQL, Tailwind fluent tokens. Κανένα νέο dependency.

**Spec:** `docs/superpowers/specs/2026-07-17-dashboard-v2-design.md` — διάβασέ το ΠΡΙΝ από κάθε task.

**Γενικοί κανόνες για όλα τα tasks:**
- Κάθε νέο UI component: `'use client'`, Fluent στυλ όπως τα υπάρχοντα (κάρτες `bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4`, labels 11-12px, `tabular-nums` σε αριθμούς).
- Χρώματα status από `STATUS_SERIES` (lib/reports/chart-theme), labels από `STATUS_LABELS_EL` (lib/reports/shared).
- Ηλικία/urgency: πάντα icon+κείμενο, ποτέ μόνο χρώμα.
- Μετά από κάθε task: `npx tsc --noEmit` καθαρό πριν το commit. Στο τελικό task και `npm run build`.
- Verify icons με `node -e "const i=require('@fluentui/react-icons'); ..."` πριν χρησιμοποιήσεις όνομα εικονιδίου· αντικατέστησε με πλησιέστερο υπαρκτό αν λείπει και σημείωσέ το.

---

### Task 1: Data layer — `lib/dashboard/` builders + smoke test

**Files:**
- Create: `lib/dashboard/types.ts`, `lib/dashboard/attention.ts`, `lib/dashboard/my-day.ts`, `lib/dashboard/capacity.ts`, `lib/dashboard/radar.ts`, `lib/dashboard/pulse.ts`
- Create: `scripts/test-dashboard.ts`

Όλες οι έξοδοι JSON-safe (ISO strings, numbers). Κοινό input: `{ userId, isPrivileged, now?: Date }`.

- [ ] **Step 1: `lib/dashboard/types.ts`**

```ts
export type DashScope = { userId: string; isPrivileged: boolean; now?: Date }

export type AttentionItem = {
  kind: 'ticket_new' | 'ticket_reply' | 'approval' | 'missing_resolution' | 'kb_draft' | 'question' | 'meeting_review'
  id: string            // id της πηγής (ticketId/taskId/questionId)
  title: string
  subtitle: string | null
  href: string          // πλήρες link πλοήγησης
  ageHours: number
  // inline ενέργεια που μπορεί να γίνει χωρίς πλοήγηση (βλ. Ζώνη 1 στο spec)
  action: 'open' | 'approve' | 'write_resolution' | null
  taskId: string | null // για approve / write_resolution
  ticket: { id: string; code: string; subject: string } | null
}

export type MyDayData = {
  today: { id: string; title: string; kind: 'task' | 'meeting'; time: string | null; projectName: string | null; href: string }[]
  tomorrow: { id: string; title: string; projectName: string | null; href: string }[]
  inProgress: {
    id: string; title: string; projectName: string; href: string
    accumulatedMs: number; startedAtIso: string | null
    fromTicket: boolean
  }[]
  overdue: { id: string; title: string; projectName: string; daysLate: number; href: string }[]
}

export type CapacityRow = {
  userId: string; name: string; email: string; avatarUrl?: string
  openTasks: number; overdue: number
  busyHours: number; capacityHours: number; utilizationPct: number
  nextFreeIso: string | null; freeNow: boolean
}

export type RadarDay = {
  dayIso: string          // YYYY-MM-DD
  label: string           // «Δευ 21»
  isToday: boolean
  tasks: { id: string; title: string; projectName: string; projectColor: string; href: string }[]
  projectDeadlines: { id: string; name: string; color: string }[]
}

export type PulseData = {
  kpis: {
    openTickets: number
    completedThisWeek: { value: number; delta: number | null }
    overdueTotal: number
    avgResolutionHours: { value: number | null; n: number }
  }
  pendingEmails: { id: string; subject: string; projectId: string; projectName: string; receivedAtIso: string | null }[]
  activity: { id: string; dayIso: string; actorName: string; text: string; createdAtIso: string }[]
  hotProjects: { id: string; name: string; color: string; done: number; total: number; lastActivityIso: string }[]
}
```

- [ ] **Step 2: `lib/dashboard/attention.ts`** — βλ. πίνακα Ζώνης 1 του spec. Πλήρης υλοποίηση:

```ts
import { prisma } from '@/lib/prisma'
import type { AttentionItem, DashScope } from './types'

const HOUR = 3_600_000

function ageH(from: Date, now: Date): number {
  return Math.max(0, Math.round(((now.getTime() - from.getTime()) / HOUR) * 10) / 10)
}

export async function buildAttention(scope: DashScope): Promise<AttentionItem[]> {
  const now = scope.now ?? new Date()
  const { userId, isPrivileged } = scope
  const items: AttentionItem[] = []

  const [newTickets, needsInfo, reviewTasks, unresolved, kbTickets, questions, meetingReview] = await Promise.all([
    isPrivileged
      ? prisma.ticket.findMany({
          where: { status: { in: ['new', 'analyzing'] } },
          select: { id: true, code: true, subject: true, createdAt: true },
          orderBy: { createdAt: 'asc' }, take: 10,
        })
      : Promise.resolve([]),
    isPrivileged
      ? prisma.ticket.findMany({
          where: { status: 'needs_info' },
          select: {
            id: true, code: true, subject: true,
            messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { authorType: true, createdAt: true } },
          },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: {
        status: 'review',
        project: { approverId: { not: null }, OR: [{ approverId: userId }, { ownerId: userId }] },
      },
      select: { id: true, title: true, updatedAt: true, project: { select: { name: true } } },
      orderBy: { updatedAt: 'asc' }, take: 10,
    }),
    prisma.ticket.findMany({
      where: {
        resolutionSummary: null,
        status: { in: ['converted', 'resolved'] },
        task: {
          status: 'done',
          ...(isPrivileged ? {} : { assignees: { some: { userId } } }),
        },
      },
      select: { id: true, code: true, subject: true, taskId: true, task: { select: { completedAt: true } } },
      take: 10,
    }),
    isPrivileged
      ? prisma.ticket.findMany({
          where: { status: { in: ['resolved', 'closed'] }, events: { some: { type: 'kb_draft' } } },
          select: { id: true, code: true, subject: true, resolvedAt: true },
          orderBy: { resolvedAt: 'desc' }, take: 10,
        })
      : Promise.resolve([]),
    prisma.taskQuestion.findMany({
      where: { askedToId: userId, answeredAt: null },
      select: { id: true, question: true, createdAt: true, taskId: true, task: { select: { title: true } } },
      orderBy: { createdAt: 'asc' }, take: 10,
    }),
    isPrivileged
      ? prisma.task.findMany({
          where: { meetingNeedsReview: true, status: { not: 'done' } },
          select: { id: true, title: true, createdAt: true, project: { select: { name: true } } },
          take: 10,
        })
      : Promise.resolve([]),
  ])

  for (const t of newTickets) {
    items.push({
      kind: 'ticket_new', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'Νέο ticket χωρίς triage', href: `/tickets/${t.id}`,
      ageHours: ageH(t.createdAt, now), action: 'open', taskId: null,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  for (const t of needsInfo) {
    const last = t.messages[0]
    // Μόνο όταν η τελευταία κουβέντα είναι του πελάτη (μας περιμένει).
    if (!last || last.authorType !== 'reporter') continue
    items.push({
      kind: 'ticket_reply', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'Ο πελάτης απάντησε — περιμένει', href: `/tickets/${t.id}`,
      ageHours: ageH(last.createdAt, now), action: 'open', taskId: null,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  for (const t of reviewTasks) {
    items.push({
      kind: 'approval', id: t.id, title: t.title,
      subtitle: `${t.project.name} · περιμένει έγκριση`, href: `/board?task=${t.id}`,
      ageHours: ageH(t.updatedAt, now), action: 'approve', taskId: t.id, ticket: null,
    })
  }
  for (const t of unresolved) {
    items.push({
      kind: 'missing_resolution', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'Ολοκληρώθηκε χωρίς καταγεγραμμένη λύση', href: `/tickets/${t.id}`,
      ageHours: t.task?.completedAt ? ageH(t.task.completedAt, now) : 0,
      action: 'write_resolution', taskId: t.taskId,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  const kbApproved = new Set(
    (await prisma.knowledgeEntry.findMany({
      where: { ticketId: { in: kbTickets.map((t) => t.id) } }, select: { ticketId: true },
    })).map((e) => e.ticketId),
  )
  for (const t of kbTickets.filter((t) => !kbApproved.has(t.id))) {
    items.push({
      kind: 'kb_draft', id: t.id, title: `${t.code} · ${t.subject}`,
      subtitle: 'KB draft προς έγκριση', href: `/tickets/${t.id}`,
      ageHours: t.resolvedAt ? ageH(t.resolvedAt, now) : 0, action: 'open', taskId: null,
      ticket: { id: t.id, code: t.code, subject: t.subject },
    })
  }
  for (const q of questions) {
    items.push({
      kind: 'question', id: q.id, title: q.task.title,
      subtitle: `Ερώτηση: ${q.question.slice(0, 80)}`, href: `/board?task=${q.taskId}`,
      ageHours: ageH(q.createdAt, now), action: 'open', taskId: q.taskId, ticket: null,
    })
  }
  for (const t of meetingReview) {
    items.push({
      kind: 'meeting_review', id: t.id, title: t.title,
      subtitle: `${t.project.name} · AI task από meeting — θέλει έλεγχο`, href: `/board?task=${t.id}`,
      ageHours: ageH(t.createdAt, now), action: 'open', taskId: t.id, ticket: null,
    })
  }

  // Πιο «γερασμένα» πρώτα, με ελαφρύ boost στα tickets.
  const weight = (i: AttentionItem) =>
    i.ageHours + (i.kind === 'ticket_new' || i.kind === 'ticket_reply' ? 6 : 0)
  return items.sort((a, b) => weight(b) - weight(a)).slice(0, 15)
}
```

ΠΡΟΣΟΧΗ: έλεγξε στο prisma/schema.prisma τα πραγματικά ονόματα πεδίων του `TicketMessage` (authorType/direction — αν διαφέρει, προσάρμοσε το φίλτρο «η τελευταία απάντηση είναι του πελάτη» και σημείωσέ το) και του `TaskQuestion` (askedToId/answeredAt). Αν το TaskQuestion δεν έχει `answeredAt`, χρησιμοποίησε το πραγματικό πεδίο κατάστασης απάντησης.

- [ ] **Step 3: `lib/dashboard/my-day.ts`**

```ts
import { prisma } from '@/lib/prisma'
import type { DashScope, MyDayData } from './types'

function dayBounds(d: Date): { from: Date; to: Date } {
  const from = new Date(d); from.setHours(0, 0, 0, 0)
  const to = new Date(d); to.setHours(23, 59, 59, 999)
  return { from, to }
}

export async function buildMyDay(scope: DashScope): Promise<MyDayData> {
  const now = scope.now ?? new Date()
  const today = dayBounds(now)
  const tomorrow = dayBounds(new Date(now.getTime() + 86_400_000))
  const mine = { assignees: { some: { userId: scope.userId } } }

  const [dueToday, dueTomorrow, inProgress, overdue, meetings] = await Promise.all([
    prisma.task.findMany({
      where: { ...mine, status: { not: 'done' }, dueDate: { gte: today.from, lte: today.to } },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.task.findMany({
      where: { ...mine, status: { not: 'done' }, dueDate: { gte: tomorrow.from, lte: tomorrow.to } },
      select: { id: true, title: true, project: { select: { name: true } } },
      orderBy: { dueDate: 'asc' }, take: 8,
    }),
    prisma.task.findMany({
      where: { ...mine, status: 'in_progress' },
      select: {
        id: true, title: true, inProgressAccumulatedMs: true, inProgressStartedAt: true,
        project: { select: { name: true } }, ticket: { select: { id: true } },
      },
    }),
    prisma.task.findMany({
      where: { ...mine, status: { not: 'done' }, dueDate: { lt: today.from } },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
      orderBy: { dueDate: 'asc' }, take: 8,
    }),
    prisma.meetingNote.findMany({
      where: { startedAt: { gte: today.from, lte: today.to } },
      select: { id: true, subject: true, startedAt: true },
      orderBy: { startedAt: 'asc' }, take: 6,
    }).catch(() => []),
  ])

  const fmtTime = (d: Date | null) =>
    d ? new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' }).format(d) : null

  const todayItems = [
    ...dueToday.map((t) => ({
      id: t.id, title: t.title, kind: 'task' as const, time: fmtTime(t.dueDate),
      projectName: t.project.name, href: `/board?task=${t.id}`,
    })),
    ...meetings.map((m) => ({
      id: m.id, title: m.subject ?? 'Meeting', kind: 'meeting' as const,
      time: fmtTime(m.startedAt), projectName: null, href: '/teams-meetings',
    })),
  ].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))

  return {
    today: todayItems,
    tomorrow: dueTomorrow.map((t) => ({ id: t.id, title: t.title, projectName: t.project.name, href: `/board?task=${t.id}` })),
    inProgress: inProgress.map((t) => ({
      id: t.id, title: t.title, projectName: t.project.name, href: `/board?task=${t.id}`,
      accumulatedMs: Number(t.inProgressAccumulatedMs),
      startedAtIso: t.inProgressStartedAt?.toISOString() ?? null,
      fromTicket: Boolean(t.ticket),
    })),
    overdue: overdue.map((t) => ({
      id: t.id, title: t.title, projectName: t.project.name,
      daysLate: Math.floor((today.from.getTime() - t.dueDate!.getTime()) / 86_400_000) + 1,
      href: `/board?task=${t.id}`,
    })),
  }
}
```

ΠΡΟΣΟΧΗ: έλεγξε τα πραγματικά πεδία του `MeetingNote` (subject/startedAt) στο schema και προσάρμοσε — αν δεν έχει `startedAt`, χρησιμοποίησε το υπαρκτό ημερομηνιακό πεδίο ή παράλειψε τα meetings με σχόλιο.

- [ ] **Step 4: `lib/dashboard/capacity.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { getUserLoads } from '@/lib/task-scheduling'
import type { CapacityRow, DashScope } from './types'

// 9:00–18:30 (lib/business-hours) ⇒ 9.5h * 5 εργάσιμες.
const CAPACITY_5D_HOURS = 47.5

export async function buildCapacity(scope: DashScope): Promise<CapacityRow[]> {
  if (!scope.isPrivileged) return []
  const now = scope.now ?? new Date()

  const users = await prisma.user.findMany({
    where: { userType: 'employee', role: { in: ['admin', 'manager', 'member'] } },
    select: { id: true, name: true, email: true, image: true },
    orderBy: { name: 'asc' },
  })
  const [loads, overdueCounts] = await Promise.all([
    getUserLoads(users.map((u) => u.id)),
    prisma.taskAssignee.groupBy({
      by: ['userId'],
      where: { task: { status: { not: 'done' }, dueDate: { lt: now } }, userId: { in: users.map((u) => u.id) } },
      _count: { _all: true },
    }),
  ])
  const loadBy = new Map(loads.map((l) => [l.userId, l]))
  const overdueBy = new Map(overdueCounts.map((o) => [o.userId, o._count._all]))

  const rows: CapacityRow[] = users.map((u) => {
    const l = loadBy.get(u.id)
    const busy = l?.busyHoursNext5Days ?? 0
    const free = l?.nextFreeSlot ?? null
    return {
      userId: u.id, name: u.name ?? u.email, email: u.email, avatarUrl: u.image ?? undefined,
      openTasks: l?.openTasks ?? 0,
      overdue: overdueBy.get(u.id) ?? 0,
      busyHours: busy,
      capacityHours: CAPACITY_5D_HOURS,
      utilizationPct: Math.min(150, Math.round((busy / CAPACITY_5D_HOURS) * 100)),
      nextFreeIso: free?.toISOString() ?? null,
      freeNow: free !== null && free.getTime() - now.getTime() < 30 * 60_000,
    }
  })
  // Πιο διαθέσιμος πρώτος.
  return rows.sort((a, b) => a.utilizationPct - b.utilizationPct || a.openTasks - b.openTasks)
}
```

- [ ] **Step 5: `lib/dashboard/radar.ts`**

```ts
import { prisma } from '@/lib/prisma'
import type { DashScope, RadarDay } from './types'

export async function buildRadar(scope: DashScope): Promise<RadarDay[]> {
  const now = scope.now ?? new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 7 * 86_400_000 - 1)
  const projectWhere = scope.isPrivileged
    ? {}
    : { OR: [{ ownerId: scope.userId }, { members: { some: { userId: scope.userId } } }] }

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: 'done' }, dueDate: { gte: start, lte: end }, project: projectWhere },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true, color: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.project.findMany({
      where: { ...projectWhere, dueDate: { gte: start, lte: end }, status: { notIn: ['completed', 'archived'] } },
      select: { id: true, name: true, color: true, dueDate: true },
    }),
  ])

  const fmt = new Intl.DateTimeFormat('el-GR', { weekday: 'short', day: 'numeric' })
  const days: RadarDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    const sameDay = (x: Date) => x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate()
    days.push({
      dayIso: key,
      label: fmt.format(d),
      isToday: i === 0,
      tasks: tasks.filter((t) => t.dueDate && sameDay(t.dueDate)).map((t) => ({
        id: t.id, title: t.title, projectName: t.project.name, projectColor: t.project.color, href: `/board?task=${t.id}`,
      })),
      projectDeadlines: projects.filter((p) => p.dueDate && sameDay(p.dueDate)).map((p) => ({ id: p.id, name: p.name, color: p.color })),
    })
  }
  return days
}
```

- [ ] **Step 6: `lib/dashboard/pulse.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { pctDelta, mean, hoursBetween } from '@/lib/reports/shared'
import type { DashScope, PulseData } from './types'

const WEEK = 7 * 86_400_000

export async function buildPulse(scope: DashScope): Promise<PulseData> {
  const now = scope.now ?? new Date()
  const weekAgo = new Date(now.getTime() - WEEK)
  const twoWeeksAgo = new Date(now.getTime() - 2 * WEEK)
  const projectWhere = scope.isPrivileged
    ? {}
    : { OR: [{ ownerId: scope.userId }, { members: { some: { userId: scope.userId } } }] }

  const [openTickets, doneThisWeek, donePrevWeek, overdueTotal, resolved, pendingEmails, activity, hotProjects] =
    await Promise.all([
      scope.isPrivileged
        ? prisma.ticket.count({ where: { status: { in: ['new', 'analyzing', 'triaged', 'converted', 'needs_info'] } } })
        : Promise.resolve(0),
      prisma.task.count({ where: { project: projectWhere, completedAt: { gte: weekAgo } } }),
      prisma.task.count({ where: { project: projectWhere, completedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.task.count({ where: { project: projectWhere, status: { not: 'done' }, dueDate: { lt: now } } }),
      scope.isPrivileged
        ? prisma.ticket.findMany({
            where: { resolvedAt: { gte: weekAgo }, status: { not: 'merged' } },
            select: { createdAt: true, resolvedAt: true },
          })
        : Promise.resolve([] as { createdAt: Date; resolvedAt: Date | null }[]),
      prisma.emailMessage.findMany({
        where: { direction: 'inbound', status: { in: ['pending', 'analyzed'] }, project: projectWhere },
        select: { id: true, subject: true, projectId: true, receivedAt: true, project: { select: { name: true } } },
        orderBy: { receivedAt: 'desc' }, take: 5,
      }),
      prisma.activity.findMany({
        where: { project: projectWhere },
        select: {
          id: true, action: true, createdAt: true,
          actor: { select: { name: true, email: true } },
          task: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' }, take: 12,
      }),
      prisma.project.findMany({
        where: { ...projectWhere, status: { in: ['planning', 'active', 'on_hold'] } },
        select: {
          id: true, name: true, color: true, updatedAt: true,
          tasks: { select: { status: true } },
        },
        orderBy: { updatedAt: 'desc' }, take: 3,
      }),
    ])

  const resHours = resolved.filter((t) => t.resolvedAt).map((t) => hoursBetween(t.createdAt, t.resolvedAt!))
  const avg = mean(resHours)

  return {
    kpis: {
      openTickets,
      completedThisWeek: { value: doneThisWeek, delta: pctDelta(doneThisWeek, donePrevWeek) },
      overdueTotal,
      avgResolutionHours: { value: avg === null ? null : Math.round(avg * 10) / 10, n: resHours.length },
    },
    pendingEmails: pendingEmails.map((e) => ({
      id: e.id, subject: e.subject, projectId: e.projectId, projectName: e.project.name,
      receivedAtIso: e.receivedAt?.toISOString() ?? null,
    })),
    activity: activity.map((a) => ({
      id: a.id,
      dayIso: a.createdAt.toISOString().slice(0, 10),
      actorName: a.actor.name ?? a.actor.email,
      text: `${a.action}${a.task ? ` · ${a.task.title.slice(0, 60)}` : ''}`,
      createdAtIso: a.createdAt.toISOString(),
    })),
    hotProjects: hotProjects.map((p) => ({
      id: p.id, name: p.name, color: p.color,
      done: p.tasks.filter((t) => t.status === 'done').length,
      total: p.tasks.length,
      lastActivityIso: p.updatedAt.toISOString(),
    })),
  }
}
```

ΠΡΟΣΟΧΗ: έλεγξε ότι το `Activity` model έχει relation `project` και πεδία `action/actor/task` όπως χρησιμοποιούνται (δες πώς τα διαβάζει το σημερινό dashboard page.tsx) και προσάρμοσε την επιλογή/μορφοποίηση του text στο υπάρχον μοτίβο (υπάρχει helper για ελληνικό activity label στο dashboard-client — αντέγραψε τη λογική του στο builder ή επέστρεψε τα raw πεδία που χρειάζεται το UI).

- [ ] **Step 7: `scripts/test-dashboard.ts`** — ίδιο env-loading μοτίβο με scripts/test-reports.ts· χτίζει και τα 5 builders με `{ userId: <πρώτος admin από τη DB>, isPrivileged: true }` ΚΑΙ με έναν member (isPrivileged: false), τυπώνει counts, και ελέγχει `JSON.stringify` για όλα. Πρόσθεσε static import του assert (όχι dynamic — βλ. TS2775 στο test-reports).

- [ ] **Step 8:** `npx tsx scripts/test-dashboard.ts` πράσινο, `npx tsc --noEmit` καθαρό, commit:
```bash
git add lib/dashboard scripts/test-dashboard.ts
git commit -m "feat(dashboard): data builders — attention, my-day, capacity, radar, pulse"
```

---

### Task 2: Page rewrite + Ζώνη 1 (Attention) + Ζώνη 2 (Η μέρα μου)

**Files:**
- Rewrite: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/dashboard/attention-zone.tsx`, `app/(app)/dashboard/my-day-zone.tsx`
- Create: `app/(app)/dashboard/dashboard-shell.tsx` (layout: αριστερή κύρια στήλη + δεξιά, responsive)
- Keep (προσωρινά): `dashboard-client.tsx` (σβήνεται στο Task 5)

- [ ] **Step 1: `page.tsx`** — auth (redirect customers όπως το σημερινό — δες το υπάρχον πριν το σβήσεις), `Promise.all` στα builders (capacity/pulse μόνο isPrivileged όπου ορίζει το spec), πέρασμα στα zones μέσω `DashboardShell`. `export const dynamic = 'force-dynamic'`. Header: «Καλημέρα, {όνομα}» + ημερομηνία στα ελληνικά.

- [ ] **Step 2: `attention-zone.tsx`** — κάρτα «Χρειάζονται εσένα» με τις γραμμές του AttentionItem:
  - Icon ανά kind: ticket_new/ticket_reply `TicketDiagonal20Regular`, approval `CheckmarkCircle20Regular`, missing_resolution `DocumentEdit20Regular` (verify ονόματα), kb_draft `BookOpen20Regular` (verify), question `QuestionCircle20Regular`, meeting_review `People20Regular`.
  - Ηλικία: `<4h` neutral chip «2.5 ώρες» · `4–24h` amber «⏱ 9 ώρες» · `≥24h` red «⚠ 2 ημέρες» (μετατροπή σε ημέρες όταν ≥24). Icon+κείμενο πάντα.
  - Ενέργειες: `action==='approve'` → κουμπί «Έγκριση» που καλεί `updateTaskStatus(taskId,'done')` (import από `app/(app)/board/actions`) με `useTransition`, μετά `router.refresh()` και — αν το item έχει ticket — `checkResolutionPrompt(taskId)` → `ResolutionDialog` (υπάρχον component, δες τη χρήση στο board-client). `action==='write_resolution'` → ανοίγει κατευθείαν `ResolutionDialog` με `{ticketId, code, subject}` του item. Αλλιώς link στο href.
  - Empty state: «Όλα καθαρά 🎉 — τίποτα δεν περιμένει εσένα.»

- [ ] **Step 3: `my-day-zone.tsx`** — τρεις υπο-ενότητες σε μία κάρτα:
  - «Σήμερα» (merged tasks+meetings με ώρα αριστερά σε στήλη 44px tabular), «Αύριο» συμπτυγμένο (μόνο count + expand), «Εκπρόθεσμα» με κόκκινο chip «N ημέρες».
  - «Σε εξέλιξη τώρα»: γραμμή ανά task με **live χρονόμετρο**: `useEffect` interval 60s που κάνει re-render· εμφανιζόμενος χρόνος = `accumulatedMs + (startedAtIso ? now - startedAt : 0)` σε μορφή «2ω 15λ». Κουμπί «Ολοκλήρωση» → `updateTaskStatus(id,'done')` + resolution check αν fromTicket (ίδιο μοτίβο με Step 2).
- [ ] **Step 4:** tsc + οπτικός έλεγχος στο dev + commit `feat(dashboard): attention inbox and my-day zones`.

---

### Task 3: Ζώνη 0 — Quick Actions + ⌘K palette

**Files:**
- Create: `app/(app)/dashboard/quick-actions.tsx`, `components/command-palette.tsx`, `app/api/search-index/route.ts`
- Modify: `app/(app)/dashboard/dashboard-shell.tsx` (ένταξη), `app/(app)/layout.tsx` Ή `components/` layout host για το ⌘K (global — δες πού γίνεται render το sidebar/topbar και βάλε το palette εκεί ώστε να δουλεύει παντού· αν το global hosting είναι ρίσκο, περιόρισέ το στο dashboard και σημείωσέ το).

- [ ] **Step 1: `quick-actions.tsx`** — σειρά κουμπιών (Button secondary, icon+label): «Νέα εργασία» (BoardTaskModal mode=create — χρειάζεται projects list: πάρε τα ήδη φορτωμένα από page.tsx όπως το κάνει το board/page.tsx), «Νέο έργο» (NewProjectButton pattern — δες projects/new-project-button.tsx και επαναχρησιμοποίησε ProjectModal+ProjectForm), «Νέο email» (EmailComposerModal με πρώτα ένα μικρό project-select dropdown των projects με projectCode), «Νέο KB άρθρο» (Link /knowledge/new), «Εισαγωγή από Outlook» (project select → EmailImportModal).
- [ ] **Step 2: `app/api/search-index/route.ts`** — GET, auth required, επιστρέφει `{items:[{type:'project'|'task'|'ticket', id, label, href}]}`: projects (ορατά στον χρήστη), tasks (τίτλοι, ίδιο project scope, take 300 πιο πρόσφατα), tickets (admin only, code+subject, take 100). `Cache-Control: private, max-age=60`.
- [ ] **Step 3: `components/command-palette.tsx`** — ⌘K/Ctrl+K listener, overlay με input, fuzzy filter (απλό lowercase includes σε label, μετά ranking: startsWith πρώτα), keyboard navigation (↑↓ Enter Esc), ομαδοποίηση ανά τύπο, router.push στο href. Lazy fetch του index στο πρώτο άνοιγμα.
- [ ] **Step 4:** tsc + δοκιμή ⌘K + commit `feat(dashboard): quick actions bar and command palette`.

---

### Task 4: Ζώνη 3 (Χωρητικότητα) + Ζώνη 4 (Ραντάρ) + Ζώνη 5 (Παλμός)

**Files:**
- Create: `app/(app)/dashboard/capacity-zone.tsx`, `app/(app)/dashboard/radar-zone.tsx`, `app/(app)/dashboard/pulse-zone.tsx`
- Modify: `dashboard-shell.tsx`, `page.tsx` (πέρασμα δεδομένων)

- [ ] **Step 1: `capacity-zone.tsx`** (μόνο isPrivileged) — γραμμή ανά χρήστη: Avatar+όνομα, utilization bar (πράσινο <70, amber 70–95, κόκκινο >95 — ποσοστό ΚΑΙ ως κείμενο «32%»), «N ανοιχτά · M εκπρόθεσμα», chip διαθεσιμότητας: «Διαθέσιμος τώρα» (πράσινο) / «Ελεύθερος: Δευ 09:00» (Intl.DateTimeFormat el-GR weekday+ώρα). Κουμπί «Ανάθεση» → BoardTaskModal create με defaultProjectId undefined και ΠΡΟΣΥΜΠΛΗΡΩΜΕΝΟ assignee — δες τα props του BoardTaskModal/TaskForm: αν δεν υποστηρίζει default assignee, πρόσθεσε προαιρετικό prop `defaultAssigneeIds` στο TaskForm (μικρή, συμβατή επέκταση). Header κάρτας: «X διαθέσιμοι τώρα» + toggle ταξινόμησης (διαθεσιμότητα/φόρτος).
- [ ] **Step 2: `radar-zone.tsx`** — 7 στήλες (grid-cols-7), header ημέρας (σήμερα highlighted), μέσα chips: κουκκίδα project-color + τίτλος (truncate, title attr), ⚑ για project deadline. Κλικ ημέρας → expand λίστα από κάτω (state). Κενή ημέρα: παύλα. Σε στενό viewport: οριζόντιο scroll.
- [ ] **Step 3: `pulse-zone.tsx`** — 4× `KpiTile` (import από components/reports/kpi-tile) σε grid-cols-2, με Link wrapper προς `/reports?tab=...`. Από κάτω: «Εκκρεμή emails» λίστα (subject truncate + project + link `/projects/{id}?tab=emails` — έλεγξε το πραγματικό tab param του project detail), activity ομαδοποιημένο ανά ημέρα (σχετική επικεφαλίδα «Σήμερα/Χθες/ημερομηνία»), «Θερμά projects» mini-κάρτες (όνομα, progress bar, link).
- [ ] **Step 4:** tsc + commit `feat(dashboard): capacity, deadline radar and pulse zones`.

---

### Task 5: Καθάρισμα + τελική επαλήθευση

- [ ] **Step 1:** Διάγραψε `app/(app)/dashboard/dashboard-client.tsx` (και ό,τι import έμεινε). `grep -rn "dashboard-client" app components` → κανένα αποτέλεσμα.
- [ ] **Step 2:** `npx tsx scripts/test-dashboard.ts` πράσινο· `npx tsc --noEmit` και `npm run build` καθαρά.
- [ ] **Step 3:** Οπτικός έλεγχος: admin + member, στενό/φαρδύ viewport, empty states (χρήστης χωρίς tasks), λειτουργία «Έγκριση»/«Ολοκλήρωση»/«Γράψε λύση» inline, ⌘K, Quick Actions modals.
- [ ] **Step 4:** Commit `chore(dashboard): remove superseded dashboard client` και push στο feature branch.

---

## Self-Review Notes

- Spec coverage: Ζώνη 0→T3, Ζώνη 1→T2, Ζώνη 2→T2, Ζώνη 3→T4, Ζώνη 4→T4, Ζώνη 5→T4, ρόλοι σε builders (T1) + zones, performance (builders με ≤10 queries συνολικά — τα attention/pulse μοιράζονται τίποτα βαρύ), testing→T1/T5.
- Τα σημεία αβεβαιότητας schema (TicketMessage.authorType, TaskQuestion.answeredAt, MeetingNote πεδία, Activity relations, project detail tab param, TaskForm default assignee) είναι ρητά σημειωμένα στους implementers με οδηγία επαλήθευσης στο schema/υπάρχον κώδικα — όχι σιωπηλές υποθέσεις.
