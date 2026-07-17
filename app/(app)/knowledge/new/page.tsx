import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { EntryForm } from '../entry-form'

export const dynamic = 'force-dynamic'

export default async function NewKnowledgeEntryPage() {
  const session = await auth()
  const role = session?.user?.role
  if (!session?.user?.id || (role !== 'admin' && role !== 'manager')) redirect('/knowledge')

  const [sources, projects, helpCategories] = await Promise.all([
    prisma.ticketSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.helpCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-fluent-neutral-90 mb-6">Νέα εγγραφή γνώσης</h1>
      <EntryForm
        initial={{ title: '', problem: '', solution: '', tags: [], category: null, projectId: null, sourceId: null, isPublic: false, helpCategoryId: null }}
        sources={sources}
        projects={projects}
        helpCategories={helpCategories}
        canDelete={false}
      />
    </div>
  )
}
