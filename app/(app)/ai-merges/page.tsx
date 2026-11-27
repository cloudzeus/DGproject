import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { isTaskMergeApprover, stringArrayFromJson } from '@/lib/ai/task-merge-rules'
import { AiMergesClient, type AiMergeProposalView } from './ai-merges-client'

export const dynamic = 'force-dynamic'

type Snapshot = { id: string; title: string; questionCount: number }

function taskSnapshots(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    return typeof row.id === 'string' && typeof row.title === 'string'
      ? [{ id: row.id, title: row.title, questionCount: typeof row.questionCount === 'number' ? row.questionCount : 0 }]
      : []
  })
}

export default async function AiMergesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'manager')) notFound()

  const [{ project: requestedProject }, projects] = await Promise.all([
    searchParams,
    prisma.project.findMany({
      where: { status: { not: 'archived' } },
      select: { id: true, name: true, color: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    }),
  ])
  const selectedProjectId = projects.some((project) => project.id === requestedProject)
    ? requestedProject!
    : projects[0]?.id ?? ''
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null

  const rows = selectedProjectId ? await prisma.taskMergeProposal.findMany({
    where: { projectId: selectedProjectId, status: { in: ['pending', 'approved'] } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  }) : []

  const proposals: AiMergeProposalView[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
    primaryTaskId: row.primaryTaskId,
    title: row.suggestedTitle,
    description: row.suggestedDescription,
    rationale: row.rationale,
    confidence: row.confidence,
    tasks: taskSnapshots(row.taskSnapshots),
    explanation: row.explanation,
    emailError: row.emailError,
    emailSentCount: stringArrayFromJson(row.emailSentTo).length,
    recipientCount: stringArrayFromJson(row.recipients).length,
    emailSentAt: row.emailSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    provider: row.provider,
    model: row.model,
  }))

  return (
    <AiMergesClient
      projects={projects}
      selectedProject={selectedProject}
      proposals={proposals}
      canApprove={isTaskMergeApprover(session.user.email)}
      currentUserEmail={session.user.email ?? ''}
    />
  )
}
