export const TASK_MERGE_APPROVER_EMAIL = 'gkozyris@dgsmart.gr'

export function isTaskMergeApprover(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === TASK_MERGE_APPROVER_EMAIL
}

/** Remove direct identifiers before task content is sent to an external LLM. */
export function maskTaskMergePii(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/g, '[email]')
    .replace(/(?:\+?\d[\d\s\-()]{8,}\d)/g, '[τηλέφωνο]')
}

export type TaskMergeGroup = {
  primaryTaskId: string
  taskIds: string[]
  title: string
  description: string
  rationale: string
  confidence: number
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Accept only model groups that reference real task ids from the analyzed project.
 * Invalid or overlapping groups are discarded, never repaired by inventing ids.
 */
export function normalizeTaskMergeGroups(value: unknown, allowedTaskIds: Iterable<string>): TaskMergeGroup[] {
  const allowed = new Set(allowedTaskIds)
  const rawGroups = value && typeof value === 'object' && Array.isArray((value as { groups?: unknown }).groups)
    ? (value as { groups: unknown[] }).groups
    : []
  const used = new Set<string>()
  const groups: TaskMergeGroup[] = []

  for (const raw of rawGroups.slice(0, 6)) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Record<string, unknown>
    const taskIds = Array.isArray(candidate.taskIds)
      ? [...new Set(candidate.taskIds.filter((id): id is string => typeof id === 'string' && allowed.has(id)))]
      : []
    const primaryTaskId = typeof candidate.primaryTaskId === 'string' ? candidate.primaryTaskId : ''
    if (taskIds.length < 2 || taskIds.length > 6 || !taskIds.includes(primaryTaskId)) continue
    if (taskIds.some((id) => used.has(id))) continue

    const title = text(candidate.title, 200)
    const description = text(candidate.description, 12_000)
    const rationale = text(candidate.rationale, 4_000)
    if (!title || !description || !rationale) continue

    const rawConfidence = typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
      ? candidate.confidence
      : 0.5
    taskIds.forEach((id) => used.add(id))
    groups.push({
      primaryTaskId,
      taskIds,
      title,
      description,
      rationale,
      confidence: Math.min(1, Math.max(0, rawConfidence)),
    })
  }
  return groups
}

export type MergeParticipant = {
  id: string
  email: string
  name: string | null
  isAIAgent?: boolean
}

export type MergeParticipantTask = {
  creator: MergeParticipant
  assignees: Array<{ user: MergeParticipant }>
  questions: Array<{ askedBy: MergeParticipant; askedTo: MergeParticipant }>
}

/** Creators, executors and Q&A participants of every source task, deduplicated by email. */
export function collectMergeParticipants(tasks: MergeParticipantTask[]): MergeParticipant[] {
  const byEmail = new Map<string, MergeParticipant>()
  for (const task of tasks) {
    const people = [
      task.creator,
      ...task.assignees.map((a) => a.user),
      ...task.questions.flatMap((q) => [q.askedBy, q.askedTo]),
    ]
    for (const person of people) {
      const email = person.email?.trim().toLowerCase()
      if (!email || person.isAIAgent || byEmail.has(email)) continue
      byEmail.set(email, { id: person.id, email, name: person.name })
    }
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}

export function mergedTaskStatus(statuses: string[]): 'backlog' | 'todo' | 'in_progress' | 'review' {
  if (statuses.includes('review')) return 'review'
  if (statuses.includes('in_progress')) return 'in_progress'
  if (statuses.includes('todo')) return 'todo'
  return 'backlog'
}

export function mergedTrackedMs(
  tasks: Array<{
    status: string
    inProgressStartedAt: Date | null
    inProgressAccumulatedMs: bigint | number
  }>,
  now: Date,
): number {
  return tasks.reduce((total, task) => {
    const accumulated = Number(task.inProgressAccumulatedMs)
    const live = task.status === 'in_progress' && task.inProgressStartedAt
      ? Math.max(0, now.getTime() - task.inProgressStartedAt.getTime())
      : 0
    return total + accumulated + live
  }, 0)
}

export function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
