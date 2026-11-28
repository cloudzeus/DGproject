'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { canApprove, isApprovalGatedTransition } from '@/lib/approval'
import { computeInProgressTimerUpdate } from '@/lib/task-in-progress-timer'
import { isStaleOpenTask, parseBillableHours, staleTaskCutoff } from '@/lib/task-lifecycle'
import { notifyTaskStatusChange } from '@/lib/notifications'
import { syncTaskCalendar } from '@/lib/task-calendar-sync'
import { syncTaskTeams } from '@/lib/task-teams-sync'

export async function bulkResolveStaleTasks(
  projectId: string,
  updates: Array<{ id: string; billableHours?: number | string | null }>,
  action: 'done' | 'cancelled',
) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Δεν έχεις συνδεθεί.' }
  if (session.user.role === 'viewer' || session.user.userType === 'customer') {
    return { ok: false, error: 'Δεν έχεις δικαίωμα επεξεργασίας.' }
  }
  if (action !== 'done' && action !== 'cancelled') return { ok: false, error: 'Μη έγκυρη ενέργεια.' }
  if (!Array.isArray(updates) || updates.length === 0) return { ok: false, error: 'Δεν επιλέχθηκαν εργασίες.' }
  if (updates.length > 200) return { ok: false, error: 'Επίλεξε έως 200 εργασίες κάθε φορά.' }
  const ids = [...new Set(updates.map((update) => update.id))]
  if (ids.length !== updates.length) return { ok: false, error: 'Η λίστα περιέχει διπλότυπες εργασίες.' }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, workspaceId: true, ownerId: true, approverId: true,
      members: { select: { userId: true } },
    },
  })
  if (!project) return { ok: false, error: 'Το έργο δεν βρέθηκε.' }
  const actorId = session.user.id
  const canEdit = session.user.role === 'admin' || session.user.role === 'manager' ||
    project.ownerId === actorId || project.members.some((member) => member.userId === actorId)
  if (!canEdit) return { ok: false, error: 'Δεν έχεις δικαίωμα επεξεργασίας.' }

  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, projectId, mergedIntoId: null, createdAt: { lte: staleTaskCutoff() }, status: { notIn: ['done', 'cancelled'] } },
    select: {
      id: true, title: true, status: true, createdAt: true, createdById: true,
      inProgressStartedAt: true, inProgressAccumulatedMs: true,
      assignees: { select: { userId: true } }, requesters: { select: { userId: true } }, watchers: { select: { userId: true } },
    },
  })
  if (tasks.length !== ids.length || tasks.some((task) => !isStaleOpenTask(task))) {
    return { ok: false, error: 'Κάποιες εργασίες δεν είναι πλέον επιλέξιμες. Ανανέωσε και δοκίμασε ξανά.' }
  }

  let billableById = new Map<string, number | null>()
  try {
    billableById = new Map(updates.map((update) => [update.id, parseBillableHours(update.billableHours)]))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Μη έγκυρες χρεώσιμες ώρες.' }
  }

  if (action === 'done' && project.approverId && !canApprove({ approverId: project.approverId, ownerId: project.ownerId, userId: actorId, userRole: session.user.role })) {
    return { ok: false, error: 'Μόνο ο υπεύθυνος έγκρισης μπορεί να ολοκληρώσει αυτές τις εργασίες.' }
  }

  const now = new Date()
  try {
    await prisma.$transaction(async (tx) => {
      for (const task of tasks) {
        if (action === 'done' && isApprovalGatedTransition(project.approverId, task.status, action) && !canApprove({ approverId: project.approverId, ownerId: project.ownerId, userId: actorId, userRole: session.user.role })) {
          throw new Error('Απαιτείται έγκριση.')
        }
        const timerFields = computeInProgressTimerUpdate(task.status, action, task.inProgressStartedAt, task.inProgressAccumulatedMs, now)
        await tx.task.update({
          where: { id: task.id },
          data: {
            status: action,
            completedAt: action === 'done' ? now : null,
            billableHours: action === 'done' ? billableById.get(task.id) ?? null : null,
            ...timerFields,
          },
        })
        await tx.activity.create({
          data: {
            workspaceId: project.workspaceId, projectId, taskId: task.id, actorId,
            action: action === 'done' ? 'completed' : 'moved', targetType: 'task',
            metadata: { from: task.status, to: action, bulk: true, staleDays: 30, billableHours: action === 'done' ? billableById.get(task.id) ?? null : null },
          },
        })
      }
    })
  } catch (error) {
    console.error('[stale tasks] bulk resolution failed:', error)
    return { ok: false, error: 'Η μαζική ενημέρωση απέτυχε. Δεν άλλαξε καμία εργασία.' }
  }

  for (const task of tasks) {
    await syncTaskCalendar(task.id)
    await syncTaskTeams(task.id)
    await notifyTaskStatusChange({
      taskId: task.id, projectId, actorId, from: task.status, to: action,
      approverId: project.approverId, taskTitle: task.title, projectName: project.name,
      createdById: task.createdById, ownerId: project.ownerId,
      assigneeIds: task.assignees.map((item) => item.userId),
      requesterIds: task.requesters.map((item) => item.userId),
      watcherIds: task.watchers.map((item) => item.userId),
    })
  }
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/board')
  revalidatePath('/dashboard')
  return { ok: true, count: tasks.length }
}
