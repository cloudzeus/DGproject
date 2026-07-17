import { prisma } from '@/lib/prisma'

// Similarity lookups for ticket triage. Tries MySQL FULLTEXT first (indexes
// created in the ticketing_system migration); falls back to LIKE on the
// longest keywords if FULLTEXT is unavailable.

export type SimilarTask = {
  id: string
  title: string
  status: string
  projectId: string
  projectName: string
  assignees: { userId: string; name: string | null }[]
}

export type SimilarKnowledge = {
  id: string
  title: string
  problem: string
  solution: string
}

function keywords(text: string, max = 6): string[] {
  return Array.from(
    new Set(
      text
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 3)
        .sort((a, b) => b.length - a.length)
    )
  ).slice(0, max)
}

export async function findSimilarTasks(text: string, limit = 5): Promise<SimilarTask[]> {
  let ids: string[] = []
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM Task
      WHERE MATCH(title, description) AGAINST(${text.slice(0, 500)} IN NATURAL LANGUAGE MODE)
      LIMIT ${limit}`
    ids = rows.map((r) => r.id)
  } catch {
    // FULLTEXT index missing — LIKE fallback
    const words = keywords(text)
    if (words.length === 0) return []
    const tasks = await prisma.task.findMany({
      where: { OR: words.map((w) => ({ title: { contains: w } })) },
      select: { id: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    })
    ids = tasks.map((t) => t.id)
  }
  if (ids.length === 0) return []

  const tasks = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      status: true,
      projectId: true,
      project: { select: { name: true } },
      assignees: { select: { userId: true, user: { select: { name: true } } } },
    },
  })
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    projectId: t.projectId,
    projectName: t.project.name,
    assignees: t.assignees.map((a) => ({ userId: a.userId, name: a.user.name })),
  }))
}

export async function findKnowledgeEntries(text: string, limit = 5): Promise<SimilarKnowledge[]> {
  try {
    return await prisma.$queryRaw<SimilarKnowledge[]>`
      SELECT id, title, problem, solution FROM KnowledgeEntry
      WHERE MATCH(title, problem, solution, tags) AGAINST(${text.slice(0, 500)} IN NATURAL LANGUAGE MODE)
      LIMIT ${limit}`
  } catch {
    const words = keywords(text)
    if (words.length === 0) return []
    return prisma.knowledgeEntry.findMany({
      where: { OR: words.flatMap((w) => [{ title: { contains: w } }, { tags: { contains: w } }]) },
      select: { id: true, title: true, problem: true, solution: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })
  }
}
