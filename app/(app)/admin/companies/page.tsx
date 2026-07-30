import { prisma } from '@/lib/prisma'
import { CompaniesClient } from './companies-client'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 60

/**
 * Η αναζήτηση γίνεται server-side. Το tenant έχει ~3900 πελάτες μετά τη μαζική
 * εισαγωγή, οπότε η μεταφορά όλης της λίστας στον client και φιλτράρισμα εκεί
 * θα ήταν βαρύ payload για μηδέν κέρδος.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactive?: string }>
}) {
  // Admin gate enforced by app/(app)/admin/layout.tsx
  const { q = '', inactive } = await searchParams
  const needle = q.trim()
  const includeInactive = inactive === '1'

  const where = {
    ...(includeInactive ? {} : { ISACTIVE: 1 }),
    ...(needle
      ? { OR: [{ NAME: { contains: needle } }, { AFM: { contains: needle } }, { CODE: { contains: needle } }] }
      : {}),
  }

  const [companies, total, grandTotal] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ NAME: 'asc' }],
      take: PAGE_SIZE,
      select: {
        id: true, TRDR: true, CODE: true, NAME: true, AFM: true, CITY: true, ISACTIVE: true,
        _count: { select: { contacts: true, users: true, primaryProjects: true } },
      },
    }),
    prisma.company.count({ where }),
    prisma.company.count(),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-fluent-neutral-90">Εταιρίες</h1>
      <p className="text-sm text-fluent-neutral-60 mt-1 mb-6">
        Πελάτες και συνεργαζόμενες εταιρίες — {grandTotal.toLocaleString('el-GR')} συνολικά.
        Τα στοιχεία αντλούνται από το ΑΦΜ μέσω ΑΑΔΕ· η καταχώριση στο SoftOne δεν είναι υποχρεωτική.
      </p>
      <CompaniesClient
        q={needle}
        includeInactive={includeInactive}
        shown={companies.length}
        total={total}
        pageSize={PAGE_SIZE}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.NAME,
          afm: c.AFM,
          code: c.CODE,
          city: c.CITY,
          isActive: c.ISACTIVE === 1,
          linkedToSoftOne: c.TRDR !== null,
          contactCount: c._count.contacts,
          userCount: c._count.users,
          projectCount: c._count.primaryProjects,
        }))}
      />
    </div>
  )
}
