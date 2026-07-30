import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { CompanyDetailClient } from './company-detail-client'

export const dynamic = 'force-dynamic'

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Admin gate enforced by app/(app)/admin/layout.tsx
  const { id } = await params
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      activities: { orderBy: { order: 'asc' } },
      users: { select: { id: true, name: true, email: true, role: true } },
      primaryProjects: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      projectRoles: {
        select: { id: true, role: true, project: { select: { id: true, name: true } } },
      },
    },
  })
  if (!company) notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <CompanyDetailClient
        company={{
          id: company.id,
          NAME: company.NAME,
          AFM: company.AFM,
          CODE: company.CODE,
          IRSDATA: company.IRSDATA,
          JOBTYPETRD: company.JOBTYPETRD,
          ADDRESS: company.ADDRESS,
          ZIP: company.ZIP,
          DISTRICT: company.DISTRICT,
          CITY: company.CITY,
          PHONE01: company.PHONE01,
          PHONE02: company.PHONE02,
          EMAIL: company.EMAIL,
          WEBPAGE: company.WEBPAGE,
          appNotes: company.appNotes,
          appLegalForm: company.appLegalForm,
          aadeStatus: company.aadeStatus,
          doyCode: company.doyCode,
          isActive: company.ISACTIVE === 1,
          linkedToSoftOne: company.TRDR !== null,
          syncedAt: company.syncedAt?.toISOString() ?? null,
          aadeSyncedAt: company.aadeSyncedAt?.toISOString() ?? null,
        }}
        activities={company.activities.map((a) => ({
          id: a.id,
          code: a.code,
          description: a.description,
          kind: a.kind,
        }))}
        contacts={company.contacts.map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          email: c.email,
          phone: c.phone,
          mobile: c.mobile,
          isPrimary: c.isPrimary,
          notes: c.notes,
          hasLogin: c.userId !== null,
        }))}
        users={company.users}
        clientProjects={company.primaryProjects}
        roleProjects={company.projectRoles.map((r) => ({
          id: r.id,
          role: r.role,
          projectId: r.project.id,
          projectName: r.project.name,
        }))}
      />
    </div>
  )
}
