import { prisma } from '@/lib/prisma'
import { createNotifications } from '@/lib/notifications'
import { sendTrackedEmail } from '@/lib/email-tracking'
import { appUrl, emailLayout, escapeHtml } from '@/lib/email-templates'
import { explainAcceptedTaskMerge, proposeTaskMerges } from './task-merge-llm'
import {
  TASK_MERGE_APPROVER_EMAIL,
  collectMergeParticipants,
  mergedTaskStatus,
  mergedTrackedMs,
  stringArrayFromJson,
} from './task-merge-rules'

export type TaskMergeDelivery = {
  sent: number
  remaining: number
  error?: string
}

const PARTICIPANT_SELECT = { id: true, email: true, name: true, isAIAgent: true } as const

async function loadProposalTasks(proposalId: string) {
  const proposal = await prisma.taskMergeProposal.findUnique({
    where: { id: proposalId },
    include: { project: { select: { id: true, name: true, color: true, workspaceId: true } } },
  })
  if (!proposal) return null
  const taskIds = stringArrayFromJson(proposal.taskIds)
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      creator: { select: PARTICIPANT_SELECT },
      assignees: { include: { user: { select: PARTICIPANT_SELECT } } },
      questions: {
        select: {
          question: true,
          answer: true,
          askedBy: { select: PARTICIPANT_SELECT },
          askedTo: { select: PARTICIPANT_SELECT },
        },
      },
    },
  })
  return { proposal, taskIds, tasks }
}

export async function generateTaskMergeProposals(projectId: string, actorId: string): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { projectId, mergedIntoId: null, status: { notIn: ['done', 'cancelled'] } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      questions: { select: { question: true, answer: true }, orderBy: { createdAt: 'asc' }, take: 12 },
    },
  })
  if (tasks.length < 2) return 0

  const { groups, meta } = await proposeTaskMerges(tasks)
  if (groups.length === 0) {
    await prisma.taskMergeProposal.updateMany({
      where: { projectId, status: 'pending' },
      data: { status: 'superseded', reviewedAt: new Date() },
    })
    return 0
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  await prisma.$transaction(async (tx) => {
    await tx.taskMergeProposal.updateMany({
      where: { projectId, status: 'pending' },
      data: { status: 'superseded', reviewedAt: new Date() },
    })
    for (const group of groups) {
      const snapshots = group.taskIds.map((id) => {
        const task = taskById.get(id)!
        return { id, title: task.title, questionCount: task.questions.length }
      })
      await tx.taskMergeProposal.create({
        data: {
          projectId,
          primaryTaskId: group.primaryTaskId,
          taskIds: group.taskIds,
          taskSnapshots: snapshots,
          suggestedTitle: group.title,
          suggestedDescription: group.description,
          rationale: group.rationale,
          confidence: group.confidence,
          createdById: actorId,
          provider: meta.provider,
          model: meta.model,
          inputTokens: meta.inputTokens,
          outputTokens: meta.outputTokens,
        },
      })
    }
  })

  const approver = await prisma.user.findFirst({
    where: { email: TASK_MERGE_APPROVER_EMAIL },
    select: { id: true },
  })
  if (approver) {
    await createNotifications([{
      userId: approver.id,
      type: 'approval',
      title: 'Νέες AI προτάσεις συγχώνευσης',
      message: `Δημιουργήθηκαν ${groups.length} προτάσεις που περιμένουν αποκλειστικά τη δική σου έγκριση.`,
      link: `/ai-merges?project=${projectId}`,
    }])
  }
  return groups.length
}

function earliestDate(values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date)
  return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null
}

function highestPriority(values: string[]): 'low' | 'medium' | 'high' | 'urgent' {
  const order = ['low', 'medium', 'high', 'urgent'] as const
  return values.reduce<(typeof order)[number]>((highest, value) => {
    const index = order.indexOf(value as (typeof order)[number])
    return index > order.indexOf(highest) ? order[index] : highest
  }, 'low')
}

export async function reviewTaskMergeProposal(
  proposalId: string,
  actorId: string,
  decision: 'approve' | 'reject',
): Promise<{ delivery?: TaskMergeDelivery }> {
  if (decision === 'reject') {
    const rejected = await prisma.taskMergeProposal.updateMany({
      where: { id: proposalId, status: 'pending' },
      data: { status: 'rejected', reviewedById: actorId, reviewedAt: new Date() },
    })
    if (rejected.count !== 1) throw new Error('Η πρόταση έχει ήδη αξιολογηθεί ή δεν υπάρχει.')
    return {}
  }

  const loaded = await loadProposalTasks(proposalId)
  if (!loaded || loaded.proposal.status !== 'pending') throw new Error('Η πρόταση έχει ήδη αξιολογηθεί ή δεν υπάρχει.')
  const { proposal, taskIds, tasks } = loaded
  if (tasks.length !== taskIds.length || tasks.some((task) => task.projectId !== proposal.projectId)) {
    throw new Error('Κάποιο task δεν βρέθηκε πλέον στο project. Ξανατρέξτε την AI ανάλυση.')
  }
  if (tasks.some((task) => task.mergedIntoId || task.status === 'done' || task.status === 'cancelled')) {
    throw new Error('Κάποιο task έκλεισε ή συγχωνεύθηκε ενδιάμεσα. Ξανατρέξτε την AI ανάλυση.')
  }
  if (!taskIds.includes(proposal.primaryTaskId)) throw new Error('Μη έγκυρο κύριο task στην πρόταση.')

  const llmTasks = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    questions: task.questions.map((question) => ({ question: question.question, answer: question.answer })),
  }))
  // This call happens only after the authorized approver clicked "Έγκριση".
  const { explanation } = await explainAcceptedTaskMerge({
    title: proposal.suggestedTitle,
    description: proposal.suggestedDescription,
    rationale: proposal.rationale,
    tasks: llmTasks,
  })

  const participants = collectMergeParticipants(tasks)
  const recipients = participants.map((person) => person.email)
  const now = new Date()
  const primary = tasks.find((task) => task.id === proposal.primaryTaskId)!
  const secondaryIds = taskIds.filter((id) => id !== primary.id)
  const totalTrackedMs = mergedTrackedMs(tasks, now)
  const nextStatus = mergedTaskStatus(tasks.map((task) => task.status))
  const estimates = tasks.map((task) => task.estimatedHours).filter((value): value is number => value !== null)
  const mergedEstimate = estimates.length ? estimates.reduce((sum, value) => sum + value, 0) : null

  await prisma.$transaction(async (tx) => {
    // Atomic claim: a second concurrent approval must roll back before touching tasks.
    const claimed = await tx.taskMergeProposal.updateMany({
      where: { id: proposalId, status: 'pending' },
      data: { status: 'approved', reviewedById: actorId, reviewedAt: now },
    })
    if (claimed.count !== 1) throw new Error('Η πρόταση αξιολογήθηκε παράλληλα από άλλο αίτημα.')

    await tx.task.update({
      where: { id: primary.id },
      data: {
        title: proposal.suggestedTitle,
        description: proposal.suggestedDescription,
        status: nextStatus,
        priority: highestPriority(tasks.map((task) => task.priority)),
        startDate: earliestDate(tasks.map((task) => task.startDate)),
        dueDate: earliestDate(tasks.map((task) => task.dueDate)),
        estimatedHours: mergedEstimate,
        visibility: tasks.some((task) => task.visibility === 'internal') ? 'internal' : 'shared',
        completedAt: null,
        inProgressAccumulatedMs: BigInt(totalTrackedMs),
        inProgressStartedAt: nextStatus === 'in_progress' ? now : null,
      },
    })

    await tx.comment.updateMany({ where: { taskId: { in: secondaryIds } }, data: { taskId: primary.id } })
    await tx.attachment.updateMany({ where: { taskId: { in: secondaryIds } }, data: { taskId: primary.id } })
    await tx.taskQuestion.updateMany({ where: { taskId: { in: secondaryIds } }, data: { taskId: primary.id } })
    await tx.taskResolution.updateMany({ where: { taskId: { in: secondaryIds } }, data: { taskId: primary.id } })
    await tx.emailMessage.updateMany({ where: { taskId: { in: secondaryIds } }, data: { taskId: primary.id } })

    const assignees = await tx.taskAssignee.findMany({ where: { taskId: { in: taskIds } } })
    const primaryUserIds = new Set(assignees.filter((row) => row.taskId === primary.id).map((row) => row.userId))
    await tx.taskAssignee.deleteMany({ where: { taskId: { in: secondaryIds } } })
    for (const userId of new Set(assignees.map((row) => row.userId))) {
      if (!primaryUserIds.has(userId)) await tx.taskAssignee.create({ data: { taskId: primary.id, userId } })
    }

    const tags = await tx.taskTag.findMany({ where: { taskId: { in: taskIds } } })
    const primaryTags = new Set(tags.filter((tag) => tag.taskId === primary.id).map((tag) => tag.name))
    await tx.taskTag.deleteMany({ where: { taskId: { in: secondaryIds } } })
    for (const name of new Set(tags.map((tag) => tag.name))) {
      if (!primaryTags.has(name)) await tx.taskTag.create({ data: { taskId: primary.id, name } })
    }

    const requirements = await tx.taskRequirement.findMany({ where: { taskId: { in: taskIds } } })
    const primaryRequirements = new Set(requirements.filter((row) => row.taskId === primary.id).map((row) => row.requirementId))
    await tx.taskRequirement.deleteMany({ where: { taskId: { in: secondaryIds } } })
    for (const requirementId of new Set(requirements.map((row) => row.requirementId))) {
      if (!primaryRequirements.has(requirementId)) {
        await tx.taskRequirement.create({ data: { taskId: primary.id, requirementId } })
      }
    }

    const dependencies = await tx.taskDependency.findMany({
      where: { OR: [{ taskId: { in: taskIds } }, { dependsOnId: { in: taskIds } }] },
    })
    const mappedPairs = new Map<string, { taskId: string; dependsOnId: string }>()
    for (const dependency of dependencies) {
      const pair = {
        taskId: secondaryIds.includes(dependency.taskId) ? primary.id : dependency.taskId,
        dependsOnId: secondaryIds.includes(dependency.dependsOnId) ? primary.id : dependency.dependsOnId,
      }
      if (pair.taskId !== pair.dependsOnId) mappedPairs.set(`${pair.taskId}:${pair.dependsOnId}`, pair)
    }
    await tx.taskDependency.deleteMany({
      where: { OR: [{ taskId: { in: secondaryIds } }, { dependsOnId: { in: secondaryIds } }] },
    })
    const pairs = [...mappedPairs.values()]
    const existingPairs = pairs.length ? await tx.taskDependency.findMany({
      where: { OR: pairs.map((pair) => ({ taskId: pair.taskId, dependsOnId: pair.dependsOnId })) },
    }) : []
    const existingKeys = new Set(existingPairs.map((pair) => `${pair.taskId}:${pair.dependsOnId}`))
    for (const pair of pairs) {
      if (!existingKeys.has(`${pair.taskId}:${pair.dependsOnId}`)) await tx.taskDependency.create({ data: pair })
    }

    await tx.task.updateMany({
      where: { id: { in: secondaryIds } },
      data: {
        status: 'done',
        completedAt: now,
        mergedIntoId: primary.id,
        inProgressStartedAt: null,
      },
    })
    await tx.activity.create({
      data: {
        workspaceId: proposal.project.workspaceId,
        projectId: proposal.projectId,
        taskId: primary.id,
        actorId,
        action: 'updated',
        targetType: 'task',
        metadata: { kind: 'ai_merge', proposalId, mergedTaskIds: secondaryIds },
      },
    })
    await tx.taskMergeProposal.update({
      where: { id: proposalId },
      data: {
        status: 'approved',
        explanation,
        recipients,
        emailSentTo: [],
        reviewedById: actorId,
        reviewedAt: now,
        emailError: recipients.length ? null : 'Δεν βρέθηκαν συμμετέχοντες με email για αποστολή.',
      },
    })
  }, { timeout: 30_000 })

  const delivery = await sendAcceptedTaskMergeEmails(proposalId, actorId)
  return { delivery }
}

type TaskSnapshot = { id: string; title: string; questionCount?: number }

function snapshots(value: unknown): TaskSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    return typeof row.id === 'string' && typeof row.title === 'string'
      ? [{ id: row.id, title: row.title, questionCount: typeof row.questionCount === 'number' ? row.questionCount : 0 }]
      : []
  })
}

export async function sendAcceptedTaskMergeEmails(proposalId: string, actorId: string): Promise<TaskMergeDelivery> {
  const proposal = await prisma.taskMergeProposal.findUnique({
    where: { id: proposalId },
    include: {
      project: { select: { id: true, name: true, color: true } },
      primaryTask: { select: { id: true, title: true } },
    },
  })
  if (!proposal || proposal.status !== 'approved' || !proposal.explanation) {
    throw new Error('Δεν υπάρχει εγκεκριμένη AI επεξήγηση για αποστολή.')
  }

  const recipients = stringArrayFromJson(proposal.recipients).map((email) => email.toLowerCase())
  const alreadySent = new Set(stringArrayFromJson(proposal.emailSentTo).map((email) => email.toLowerCase()))
  const remaining = recipients.filter((email) => !alreadySent.has(email))
  if (recipients.length === 0) return { sent: 0, remaining: 0, error: 'Δεν υπάρχουν παραλήπτες για αυτή τη συγχώνευση.' }
  if (remaining.length === 0) return { sent: 0, remaining: 0 }

  const taskUrl = appUrl(`/board?task=${proposal.primaryTask.id}`)
  const sourceList = snapshots(proposal.taskSnapshots).map((task) =>
    `<li style="margin:4px 0;">${escapeHtml(task.title)}${task.id === proposal.primaryTaskId ? ' — κύριο task' : ''}</li>`,
  ).join('')
  const explanationHtml = proposal.explanation.split(/\n{2,}/).map((paragraph) =>
    `<p style="font-size:14px;line-height:1.65;color:#202020;white-space:pre-wrap;margin:0 0 14px;">${escapeHtml(paragraph)}</p>`,
  ).join('')

  let lastError: string | undefined
  for (const recipient of remaining) {
    const html = emailLayout({
      header: {
        kicker: { text: 'AI επεξήγηση εγκεκριμένης συγχώνευσης', tone: 'success' },
        eyebrow: { text: proposal.project.name, color: proposal.project.color },
        title: proposal.primaryTask.title,
      },
      body: `${explanationHtml}<h2 style="font-size:14px;margin:18px 0 8px;">Αρχικά tasks</h2><ul style="font-size:13px;line-height:1.5;padding-left:20px;">${sourceList}</ul>`,
      actions: taskUrl ? [{ label: 'Άνοιγμα κύριου task', url: taskUrl, variant: 'primary' }] : [],
      footerNote: 'Η συγχώνευση εγκρίθηκε από gkozyris@dgsmart.gr. Η επεξήγηση δημιουργήθηκε με AI μετά την έγκριση.',
    })
    try {
      await sendTrackedEmail({
        to: recipient,
        subject: `[${proposal.project.name}] AI συγχώνευση: ${proposal.primaryTask.title}`,
        html,
        projectId: proposal.projectId,
        taskId: proposal.primaryTaskId,
        userId: actorId,
        note: 'ai_task_merge_explanation',
        bodyPreview: proposal.explanation.slice(0, 280),
      })
      alreadySent.add(recipient)
      await prisma.taskMergeProposal.update({
        where: { id: proposalId },
        data: {
          emailSentTo: [...alreadySent],
          emailSentAt: alreadySent.size === recipients.length ? new Date() : null,
          emailError: null,
        },
      })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      break
    }
  }

  const pendingCount = recipients.filter((email) => !alreadySent.has(email)).length
  if (lastError) {
    await prisma.taskMergeProposal.update({
      where: { id: proposalId },
      data: { emailError: `Απέτυχε η αποστολή σε ${pendingCount} παραλήπτες: ${lastError}`.slice(0, 2000) },
    })
    return { sent: alreadySent.size, remaining: pendingCount, error: lastError }
  }
  return { sent: alreadySent.size, remaining: 0 }
}
