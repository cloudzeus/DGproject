import { prisma } from '@/lib/prisma'
import { TicketSourcesClient } from './ticket-sources-client'

export const dynamic = 'force-dynamic'

export default async function TicketSourcesPage() {
  // Admin gate enforced by app/(app)/admin/layout.tsx
  const [sources, projects] = await Promise.all([
    prisma.ticketSource.findMany({
      include: { defaultProject: { select: { name: true } }, _count: { select: { tickets: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.findMany({
      where: { status: { in: ['planning', 'active'] } },
      select: { id: true, name: true, projectCode: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-fluent-neutral-90">Πηγές Tickets</h1>
      <p className="text-sm text-fluent-neutral-60 mt-1 mb-6">
        Κάθε client app δηλώνει τον κωδικό πηγής και το API key στο <code className="font-mono text-xs">.env</code> του
        (<code className="font-mono text-xs">TICKETING_PROJECT_CODE</code>, <code className="font-mono text-xs">TICKETING_API_KEY</code>).
        Οδηγίες: <code className="font-mono text-xs">docs/ticketing/INTEGRATION.md</code>
      </p>
      <TicketSourcesClient
        sources={sources.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          originUrls: safeParse(s.originUrls),
          defaultProjectId: s.defaultProjectId,
          defaultProjectName: s.defaultProject?.name ?? null,
          active: s.active,
          ticketCount: s._count.tickets,
        }))}
        projects={projects}
      />
    </div>
  )
}

function safeParse(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
