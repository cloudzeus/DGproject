import { prisma } from '@/lib/prisma'
import { pctDelta, mean, hoursBetween } from '@/lib/reports/shared'
import type { DashScope, PulseData } from './types'

const WEEK = 7 * 86_400_000

// Το υπάρχον dashboard-client.tsx έχει έναν VERB helper (μόνο Αγγλικά: created/updated/
// completed/commented/assigned/moved) πάνω στο ίδιο ActivityAction enum. Δεν υπάρχει
// πουθενά στο codebase ελληνικό αντίστοιχο, οπότε φτιάχνουμε εδώ το ελληνικό mapping
// ώστε το builder να επιστρέφει έτοιμο για render κείμενο (όπως ζητά το plan).
const VERB_EL: Record<string, string> = {
  created: 'δημιούργησε',
  updated: 'ενημέρωσε',
  completed: 'ολοκλήρωσε',
  commented: 'σχολίασε σε',
  assigned: 'ανέθεσε',
  moved: 'μετακίνησε',
}

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
      // Activity δεν έχει relation "project" απευθείας φιλτραρίσιμη σε read μόνο μέσω
      // projectId — το relation field υπάρχει (project Project?) οπότε το φίλτρο δουλεύει.
      // Δεν υπάρχει πεδίο "text": το action είναι enum (ActivityAction), οπότε φτιάχνουμε
      // εδώ το ελληνικό text από action + task.title (βλ. VERB_EL πιο πάνω).
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
      text: `${VERB_EL[a.action] ?? a.action}${a.task ? ` · ${a.task.title.slice(0, 60)}` : ''}`,
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
