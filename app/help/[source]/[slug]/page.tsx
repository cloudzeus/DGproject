import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Public help-center article — no auth, serves only isPublic entries of the source.
export default async function HelpArticlePage({ params }: { params: Promise<{ source: string; slug: string }> }) {
  const { source: sourceCode, slug } = await params

  const source = await prisma.ticketSource.findUnique({
    where: { code: sourceCode },
    select: { id: true, name: true, active: true },
  })
  if (!source || !source.active) notFound()

  const entry = await prisma.knowledgeEntry.findUnique({
    where: { slug },
    select: { id: true, title: true, problem: true, solution: true, isPublic: true, sourceId: true },
  })
  if (!entry || !entry.isPublic || entry.sourceId !== source.id) notFound()

  return (
    <main className="min-h-screen bg-neutral-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link
          href={`/help/${sourceCode}`}
          className="text-sm font-medium text-[#0078d4] hover:underline"
        >
          ← Κέντρο βοήθειας
        </Link>

        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Κέντρο βοήθειας · {source.name}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">{entry.title}</h1>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Το πρόβλημα</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{entry.problem}</p>
          </section>

          <section className="mt-8 border-t border-neutral-100 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Η λύση</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{entry.solution}</p>
          </section>
        </div>
      </div>
    </main>
  )
}
