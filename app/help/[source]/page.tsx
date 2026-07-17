import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Σφάλματα',
  feature: 'Νέες λειτουργίες',
  support: 'Υποστήριξη',
  question: 'Ερωτήσεις',
  billing: 'Χρεώσεις',
  other: 'Γενικά',
}

// Public per-source help center — no auth, lists only isPublic knowledge entries.
export default async function HelpCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ source: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { source: sourceCode } = await params
  const { q } = await searchParams

  const source = await prisma.ticketSource.findUnique({ where: { code: sourceCode } })
  if (!source || !source.active) notFound()

  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      sourceId: source.id,
      isPublic: true,
      ...(q
        ? { OR: [{ title: { contains: q } }, { problem: { contains: q } }, { solution: { contains: q } }, { tags: { contains: q } }] }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, problem: true, slug: true, category: true },
    take: 200,
  })

  const groups = new Map<string, typeof entries>()
  for (const e of entries) {
    const key = e.category ?? 'other'
    groups.set(key, [...(groups.get(key) ?? []), e])
  }

  return (
    <main className="min-h-screen bg-neutral-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Κέντρο βοήθειας · {source.name}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">Κέντρο βοήθειας — {source.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">Απαντήσεις σε συχνά προβλήματα και ερωτήσεις.</p>

        <form method="get" className="mt-6">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Αναζήτηση…"
            className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-sm outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
          />
        </form>

        {entries.length === 0 ? (
          <p className="mt-10 text-sm text-neutral-500">Δεν βρέθηκαν άρθρα.</p>
        ) : (
          <div className="mt-8 space-y-8">
            {[...groups.entries()].map(([category, items]) => (
              <section key={category}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  {CATEGORY_LABELS[category] ?? 'Γενικά'}
                </h2>
                <ul className="mt-3 space-y-3">
                  {items.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/help/${sourceCode}/${e.slug}`}
                        className="block rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-colors hover:border-neutral-300"
                      >
                        <p className="text-sm font-semibold text-neutral-900">{e.title}</p>
                        <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{e.problem}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
