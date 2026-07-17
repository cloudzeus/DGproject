import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { EntryForm } from '../entry-form'

export const dynamic = 'force-dynamic'

export default async function KnowledgeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const entry = await prisma.knowledgeEntry.findUnique({ where: { id } })
  if (!entry) notFound()

  const session = await auth()
  const role = session?.user?.role
  const canEdit = role === 'admin' || role === 'manager'

  if (!canEdit) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-fluent-neutral-90 mb-6">{entry.title}</h1>
        <div className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-5 max-w-2xl space-y-5">
          {entry.problem && (
            <div>
              <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-2">Πρόβλημα</h2>
              <p className="text-sm text-fluent-neutral-70 whitespace-pre-wrap">{entry.problem}</p>
            </div>
          )}
          <div>
            <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-2">Λύση</h2>
            <p className="text-sm text-fluent-neutral-70 whitespace-pre-wrap">{entry.solution}</p>
          </div>
        </div>
      </div>
    )
  }

  const [sources, projects, helpCategories] = await Promise.all([
    prisma.ticketSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.helpCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  let tags: string[] = []
  try {
    tags = JSON.parse(entry.tags || '[]')
  } catch {}

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-fluent-neutral-90 mb-6">Επεξεργασία εγγραφής</h1>
      <EntryForm
        initial={{
          id: entry.id,
          title: entry.title,
          problem: entry.problem,
          solution: entry.solution,
          tags,
          category: entry.category,
          projectId: entry.projectId,
          sourceId: entry.sourceId,
          isPublic: entry.isPublic,
          helpCategoryId: entry.helpCategoryId,
        }}
        sources={sources}
        projects={projects}
        helpCategories={helpCategories}
        canDelete
      />
    </div>
  )
}
