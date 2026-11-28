import { prisma } from '@/lib/prisma'
import { buildCustomerAnalytics, type CustomersReport } from './customer-analytics'
import type { ReportScope } from './shared'

export type { CustomersReport, CustomerReportRow } from './customer-analytics'

export async function buildCustomersReport(scope: ReportScope): Promise<CustomersReport> {
  const { range, prev, userId, isPrivileged } = scope
  const where = isPrivileged ? {} : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] }
  const projects = await prisma.project.findMany({
    where: { ...where, primaryCompanyId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      color: true,
      status: true,
      primaryCompany: { select: { id: true, NAME: true, ISACTIVE: true } },
      tasks: {
        where: { mergedIntoId: null },
        select: {
          status: true,
          dueDate: true,
          createdAt: true,
          completedAt: true,
          estimatedHours: true,
          billableHours: true,
          inProgressAccumulatedMs: true,
          inProgressStartedAt: true,
        },
      },
    },
  })
  return buildCustomerAnalytics(projects, range, prev)
}
