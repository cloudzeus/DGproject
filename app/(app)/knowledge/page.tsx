import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma, TicketCategory } from '@prisma/client'
import { CategoryManager } from './category-manager'

export const dynamic = 'force-dynamic'

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'bug', label: '🐞 Σφάλμα' },
  { value: 'feature', label: '✨ Νέα λειτουργία' },
  { value: 'support', label: '🛟 Υποστήριξη' },
  { value: 'question', label: '❓ Ερώτηση' },
  { value: 'billing', label: '💶 Χρέωση' },
  { value: 'other', label: '📋 Άλλο' },
]

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; project?: string; category?: string; pub?: string; helpcat?: string }>
}) {
  const session = await auth()
  const role = session?.user?.role
  const canEdit = role === 'admin' || role === 'manager'
  const { q, source, project, category, pub, helpcat } = await searchParams

  const where: Prisma.KnowledgeEntryWhereInput = {}
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { problem: { contains: q } },
      { solution: { contains: q } },
      { tags: { contains: q } },
    ]
  }
  if (source) where.sourceId = source
  if (project) where.projectId = project
  if (category && CATEGORY_OPTIONS.some((c) => c.value === category)) {
    where.category = category as TicketCategory
  }
  if (pub === '1') where.isPublic = true
  if (helpcat) where.helpCategoryId = helpcat

  const [entries, sources, projects, helpCategories] = await Promise.all([
    prisma.knowledgeEntry.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.ticketSource.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.helpCategory.findMany({
      select: { id: true, name: true, _count: { select: { entries: true } } },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-fluent-neutral-90">Γνωσιακή βάση</h1>
          <p className="text-sm text-fluent-neutral-60 mt-1">
            Τεκμηριωμένες λύσεις από tickets και εργασίες — εσωτερική αναζήτηση και δημόσια άρθρα help center.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/knowledge/new"
            className="rounded-md bg-fluent-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fluent-blue-700"
          >
            Νέα εγγραφή
          </Link>
        )}
      </div>

      <form method="GET" action="/knowledge" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Αναζήτηση σε τίτλο, πρόβλημα, λύση, tags…"
          className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select name="source" defaultValue={source ?? ''} className="rounded-md border border-neutral-300 px-2 py-2 text-sm">
          <option value="">Όλες οι πηγές</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select name="project" defaultValue={project ?? ''} className="rounded-md border border-neutral-300 px-2 py-2 text-sm">
          <option value="">Όλα τα έργα</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="category" defaultValue={category ?? ''} className="rounded-md border border-neutral-300 px-2 py-2 text-sm">
          <option value="">Όλες οι κατηγορίες</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select name="helpcat" defaultValue={helpcat ?? ''} className="rounded-md border border-neutral-300 px-2 py-2 text-sm">
          <option value="">Όλες οι κατηγορίες help center</option>
          {helpCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <input type="checkbox" name="pub" value="1" defaultChecked={pub === '1'} /> Μόνο δημόσιες
        </label>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Αναζήτηση
        </button>
      </form>

      {canEdit && (
        <CategoryManager
          categories={helpCategories.map((c) => ({ id: c.id, name: c.name, count: c._count.entries }))}
        />
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-sm text-fluent-neutral-60">
          Δεν βρέθηκαν εγγραφές.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            let tags: string[] = []
            try {
              tags = JSON.parse(entry.tags || '[]')
            } catch {}
            return (
              <div key={entry.id} className="rounded-lg border border-black/5 bg-white shadow-fluent-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/knowledge/${entry.id}`}
                    className="font-medium text-fluent-neutral-90 hover:text-fluent-blue-600"
                  >
                    {entry.title}
                  </Link>
                  {entry.isPublic && (
                    <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
                      Δημόσιο
                    </span>
                  )}
                </div>
                {entry.problem && (
                  <p className="mt-1 text-sm text-fluent-neutral-60 line-clamp-2">{entry.problem}</p>
                )}
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-fluent-blue-50 px-2 py-0.5 text-[11px] font-medium text-fluent-blue-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
