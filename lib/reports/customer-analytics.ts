import {
  bucketByWeek,
  hoursBetween,
  mean,
  msToHours,
  pctDelta,
  trackedMs,
  type DateRange,
} from './shared'

export type CustomerAnalyticsTask = {
  status: string
  dueDate: Date | null
  createdAt: Date
  completedAt: Date | null
  estimatedHours: number | null
  billableHours: number | null
  inProgressAccumulatedMs: bigint
  inProgressStartedAt: Date | null
}

export type CustomerAnalyticsProject = {
  id: string
  name: string
  color: string
  status: string
  primaryCompany: { id: string; NAME: string; ISACTIVE: number } | null
  tasks: CustomerAnalyticsTask[]
}

export type CustomerReportProject = {
  id: string
  name: string
  color: string
  status: string
  total: number
  done: number
  open: number
  completionPct: number
}

export type CustomerReportRow = {
  id: string
  name: string
  isActive: boolean
  totalProjects: number
  activeProjects: number
  projects: CustomerReportProject[]
  total: number
  done: number
  open: number
  overdue: number
  completionPct: number
  createdInPeriod: number
  completedInPeriod: number
  completedPreviousPeriod: number
  completedDelta: number | null
  netFlow: number
  velocityPerWeek: number
  trackedHours: number
  estimatedHours: number
  billableHours: number
  avgCycleHours: number | null
  cycleN: number
  onTimePct: number | null
  onTimeN: number
}

export type CustomersReport = {
  summary: {
    customers: number
    activeCustomers: number
    activeProjects: number
    createdInPeriod: number
    completedInPeriod: number
    completedDelta: number | null
    overdue: number
    onTimePct: number | null
    billableHours: number
  }
  weeklyCompletions: { week: string; count: number }[]
  rows: CustomerReportRow[]
}

const round1 = (value: number) => Math.round(value * 10) / 10
const inRange = (date: Date, range: DateRange) => date >= range.from && date <= range.to

/** Pure aggregation, χωρίς Prisma, ώστε οι ορισμοί των KPI να ελέγχονται deterministic. */
export function buildCustomerAnalytics(
  input: CustomerAnalyticsProject[],
  range: DateRange,
  prev: DateRange,
  now: Date = new Date(),
): CustomersReport {
  const grouped = new Map<string, { company: NonNullable<CustomerAnalyticsProject['primaryCompany']>; projects: CustomerAnalyticsProject[] }>()
  for (const project of input) {
    if (!project.primaryCompany) continue
    const group = grouped.get(project.primaryCompany.id) ?? { company: project.primaryCompany, projects: [] }
    group.projects.push(project)
    grouped.set(project.primaryCompany.id, group)
  }

  const weeks = Math.max(1, (range.to.getTime() - range.from.getTime()) / (7 * 86_400_000))
  const completedAcrossCustomers: { completedAt: Date }[] = []
  const rows = [...grouped.values()].map(({ company, projects }): CustomerReportRow => {
    const activeTasks = projects.flatMap((project) => project.tasks).filter((task) => task.status !== 'cancelled')
    const doneTasks = activeTasks.filter((task) => task.status === 'done')
    const openTasks = activeTasks.filter((task) => task.status !== 'done')
    const completed = activeTasks.filter((task) => task.completedAt && inRange(task.completedAt, range))
    const completedPrevious = activeTasks.filter((task) => task.completedAt && inRange(task.completedAt, prev))
    const created = activeTasks.filter((task) => inRange(task.createdAt, range))
    const withDue = completed.filter((task) => task.dueDate)
    const onTime = withDue.filter((task) => task.completedAt! <= task.dueDate!)
    const cycles = completed.map((task) => hoursBetween(task.createdAt, task.completedAt!))
    const avgCycle = mean(cycles)
    completedAcrossCustomers.push(...completed.map((task) => ({ completedAt: task.completedAt! })))

    return {
      id: company.id,
      name: company.NAME,
      isActive: company.ISACTIVE === 1,
      totalProjects: projects.length,
      activeProjects: projects.filter((project) => project.status === 'active').length,
      projects: projects.map((project) => {
        const tasks = project.tasks.filter((task) => task.status !== 'cancelled')
        const done = tasks.filter((task) => task.status === 'done').length
        return {
          id: project.id,
          name: project.name,
          color: project.color,
          status: project.status,
          total: tasks.length,
          done,
          open: tasks.length - done,
          completionPct: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
        }
      }).sort((a, b) => a.name.localeCompare(b.name, 'el')),
      total: activeTasks.length,
      done: doneTasks.length,
      open: openTasks.length,
      overdue: openTasks.filter((task) => task.dueDate && task.dueDate < now).length,
      completionPct: activeTasks.length === 0 ? 0 : Math.round((doneTasks.length / activeTasks.length) * 100),
      createdInPeriod: created.length,
      completedInPeriod: completed.length,
      completedPreviousPeriod: completedPrevious.length,
      completedDelta: pctDelta(completed.length, completedPrevious.length),
      netFlow: created.length - completed.length,
      velocityPerWeek: round1(completed.length / weeks),
      trackedHours: msToHours(activeTasks.reduce((sum, task) => sum + trackedMs(task, now), 0)),
      estimatedHours: round1(activeTasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0)),
      billableHours: round1(completed.reduce((sum, task) => sum + (task.billableHours ?? 0), 0)),
      avgCycleHours: avgCycle === null ? null : round1(avgCycle),
      cycleN: cycles.length,
      onTimePct: withDue.length === 0 ? null : Math.round((onTime.length / withDue.length) * 100),
      onTimeN: withDue.length,
    }
  })

  rows.sort((a, b) => b.completedInPeriod - a.completedInPeriod || b.open - a.open || a.name.localeCompare(b.name, 'el'))
  const completedInPeriod = rows.reduce((sum, row) => sum + row.completedInPeriod, 0)
  const completedPreviousPeriod = rows.reduce((sum, row) => sum + row.completedPreviousPeriod, 0)
  const onTimeN = rows.reduce((sum, row) => sum + row.onTimeN, 0)
  const onTimeWeighted = rows.reduce((sum, row) => sum + (row.onTimePct ?? 0) * row.onTimeN, 0)

  return {
    summary: {
      customers: rows.length,
      activeCustomers: rows.filter((row) => row.isActive).length,
      activeProjects: rows.reduce((sum, row) => sum + row.activeProjects, 0),
      createdInPeriod: rows.reduce((sum, row) => sum + row.createdInPeriod, 0),
      completedInPeriod,
      completedDelta: pctDelta(completedInPeriod, completedPreviousPeriod),
      overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
      onTimePct: onTimeN === 0 ? null : Math.round(onTimeWeighted / onTimeN),
      billableHours: round1(rows.reduce((sum, row) => sum + row.billableHours, 0)),
    },
    weeklyCompletions: bucketByWeek(completedAcrossCustomers, (task) => task.completedAt, range),
    rows,
  }
}
