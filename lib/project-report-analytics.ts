import type { ProjectReportData } from './project-report';
import { median } from './reports/shared';
import { computeSpentMs } from './task-in-progress-timer';
import { dedupeCompletionActivities } from './task-contribution';

export type ProjectReportProject = NonNullable<ProjectReportData>;

export type ProjectReportStatusMetric = {
  status: string;
  label: string;
  count: number;
  percentage: number;
};

export type ProjectReportMonthMetric = {
  key: string;
  label: string;
  opened: number;
  closed: number;
};

export type ProjectReportUserMetric = {
  id: string;
  name: string;
  userType: string;
  isAIAgent: boolean;
  isCustomer: boolean;
  isDGSmart: boolean;
  requestedTasks: number;
  assignedTasks: number;
  completedTasks: number;
  openTasks: number;
  comments: number;
  activities: number;
  trackedHoursOnAssignedTasks: number;
};

export type ProjectReportAnalytics = {
  generatedAt: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  completionPercentage: number;
  averageCloseDays: number | null;
  medianCloseDays: number | null;
  totalTrackedHours: number;
  status: ProjectReportStatusMetric[];
  monthly: ProjectReportMonthMetric[];
  users: ProjectReportUserMetric[];
  customer: {
    companyId: string | null;
    companyName: string | null;
    openedTasks: number;
    completedTasks: number;
    openTasks: number;
    averageCloseDays: number | null;
    medianCloseDays: number | null;
  };
  dgsmart: {
    assignedTasks: number;
    completedTasks: number;
    comments: number;
    activities: number;
    trackedHours: number;
    aiAssignedTasks: number;
    meetingGeneratedTasks: number;
    proposalGeneratedTasks: number;
    approvedResolutions: number;
  };
};

type ReportUser = {
  id: string;
  name: string | null;
  email: string;
  userType: string;
  companyId: string | null;
  companyName: string | null;
  isAIAgent: boolean;
};

type MutableUserMetric = ProjectReportUserMetric & {
  requestedTaskIds: Set<string>;
  assignedTaskIds: Set<string>;
  completedTaskIds: Set<string>;
  openTaskIds: Set<string>;
  trackedMs: number;
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Προς έλεγχο',
  done: 'Ολοκληρωμένο',
  cancelled: 'Ακυρωμένο',
};

const STATUS_ORDER = ['done', 'in_progress', 'review', 'todo', 'backlog'] as const;

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function closeDays(task: { createdAt: Date; completedAt: Date | null; status: string }): number | null {
  if (task.status !== 'done' && task.status !== 'cancelled' || !task.completedAt) return null;
  return Math.max(0, (task.completedAt.getTime() - task.createdAt.getTime()) / 86_400_000);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nullableRound(value: number | null): number | null {
  return value === null ? null : round(value);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthly(
  project: ProjectReportProject,
  now: Date,
): ProjectReportMonthMetric[] {
  const firstTaskDate = project.tasks.reduce<Date | null>(
    (earliest, task) => (!earliest || task.createdAt < earliest ? task.createdAt : earliest),
    null,
  );
  const start = project.startDate ?? firstTaskDate ?? project.createdAt;
  const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = new Map<string, ProjectReportMonthMetric>();

  for (let cursor = startMonth; cursor <= endMonth; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const key = monthKey(cursor);
    months.set(key, {
      key,
      label: new Intl.DateTimeFormat('el-GR', { month: 'short', year: 'numeric' }).format(cursor),
      opened: 0,
      closed: 0,
    });
  }

  for (const task of project.tasks) {
    const openedKey = monthKey(task.createdAt);
    if (!months.has(openedKey)) {
      const date = new Date(task.createdAt.getFullYear(), task.createdAt.getMonth(), 1);
      months.set(openedKey, {
        key: openedKey,
        label: new Intl.DateTimeFormat('el-GR', { month: 'short', year: 'numeric' }).format(date),
        opened: 0,
        closed: 0,
      });
    }
    months.get(openedKey)!.opened += 1;

    if (task.status === 'done' && task.completedAt) {
      const closedKey = monthKey(task.completedAt);
      if (!months.has(closedKey)) {
        const date = new Date(task.completedAt.getFullYear(), task.completedAt.getMonth(), 1);
        months.set(closedKey, {
          key: closedKey,
          label: new Intl.DateTimeFormat('el-GR', { month: 'short', year: 'numeric' }).format(date),
          opened: 0,
          closed: 0,
        });
      }
      months.get(closedKey)!.closed += 1;
    }
  }

  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Deterministic metrics used by both the HTML charts and the AI prompt.
 * The model receives these values but never calculates them itself.
 */
export function buildProjectReportAnalytics(
  project: ProjectReportProject,
  now: Date = new Date(),
): ProjectReportAnalytics {
  const users = new Map<string, MutableUserMetric>();
  const customerCompanyId = project.primaryCompanyId ?? null;

  function addUser(user: ReportUser): MutableUserMetric {
    const existing = users.get(user.id);
    if (existing) return existing;
    const isCustomer = user.userType === 'customer' ||
      (customerCompanyId !== null && user.companyId === customerCompanyId);
    const isDGSmart = user.isAIAgent || user.userType === 'employee';
    const created: MutableUserMetric = {
      id: user.id,
      name: user.name?.trim() || user.email,
      userType: user.userType,
      isAIAgent: user.isAIAgent,
      isCustomer,
      isDGSmart,
      requestedTasks: 0,
      assignedTasks: 0,
      completedTasks: 0,
      openTasks: 0,
      comments: 0,
      activities: 0,
      trackedHoursOnAssignedTasks: 0,
      requestedTaskIds: new Set<string>(),
      assignedTaskIds: new Set<string>(),
      completedTaskIds: new Set<string>(),
      openTaskIds: new Set<string>(),
      trackedMs: 0,
    };
    users.set(user.id, created);
    return created;
  }

  addUser(project.owner);
  for (const member of project.members) addUser(member.user);

  const dgsmartTaskIds = new Set<string>();
  const dgsmartCompletedTaskIds = new Set<string>();
  let dgsmartTrackedMs = 0;

  for (const task of project.tasks) {
    const requesters = task.requesters.length > 0
      ? task.requesters.map((requester) => requester.user)
      : [task.creator];
    for (const requester of requesters) addUser(requester).requestedTaskIds.add(task.id);
    if (task.status === 'cancelled') continue;
    if (task.activeAIAgent) addUser(task.activeAIAgent);
    const spentMs = computeSpentMs(
      task.status,
      task.inProgressStartedAt,
      task.inProgressAccumulatedMs,
      now,
    );
    let hasDGSmartContributor = false;

    for (const assignment of task.assignees) {
      const metric = addUser(assignment.user);
      if (!metric.assignedTaskIds.has(task.id)) {
        metric.assignedTaskIds.add(task.id);
        metric.trackedMs += spentMs;
      }
      if (task.status !== 'done') metric.openTaskIds.add(task.id);
      if (metric.isDGSmart) {
        hasDGSmartContributor = true;
        dgsmartTaskIds.add(task.id);
      }
    }

    if (task.activeAIAgent) {
      hasDGSmartContributor = true;
      dgsmartTaskIds.add(task.id);
    }
    if (hasDGSmartContributor) dgsmartTrackedMs += spentMs;

    for (const comment of task.comments) addUser(comment.author).comments += 1;
    for (const resolution of task.resolutions) addUser(resolution.agent);
  }

  for (const activity of project.activities) addUser(activity.actor).activities += 1;

  const reportTaskIds = new Set(project.tasks.map((task) => task.id));
  for (const activity of dedupeCompletionActivities(project.activities)) {
    if (!activity.taskId || !reportTaskIds.has(activity.taskId)) continue;
    const metric = addUser(activity.actor);
    metric.completedTaskIds.add(activity.taskId);
    if (metric.isDGSmart) dgsmartCompletedTaskIds.add(activity.taskId);
  }

  const userMetrics = [...users.values()]
    .map(({ requestedTaskIds, assignedTaskIds, completedTaskIds, openTaskIds, trackedMs, ...metric }) => ({
      ...metric,
      requestedTasks: requestedTaskIds.size,
      assignedTasks: assignedTaskIds.size,
      completedTasks: completedTaskIds.size,
      openTasks: openTaskIds.size,
      trackedHoursOnAssignedTasks: round(trackedMs / 3_600_000),
    }))
    .sort((a, b) =>
      b.completedTasks - a.completedTasks ||
      b.assignedTasks - a.assignedTasks ||
      b.activities - a.activities ||
      a.name.localeCompare(b.name, 'el'),
    );

  const customerTasks = project.tasks.filter((task) => {
    const requesters = task.requesters.length > 0
      ? task.requesters.map((requester) => requester.user)
      : [task.creator];
    return requesters.some((requester) =>
      requester.userType === 'customer' ||
      (customerCompanyId !== null && requester.companyId === customerCompanyId),
    );
  });
  const allCloseDurations = project.tasks
    .map(closeDays)
    .filter((value): value is number => value !== null);
  const customerCloseDurations = customerTasks
    .map(closeDays)
    .filter((value): value is number => value !== null);

  const activeTasks = project.tasks.filter((task) => task.status !== 'cancelled');
  const completedTasks = activeTasks.filter((task) => task.status === 'done').length;
  const totalTrackedMs = activeTasks.reduce(
    (sum, task) => sum + computeSpentMs(
      task.status,
      task.inProgressStartedAt,
      task.inProgressAccumulatedMs,
      now,
    ),
    0,
  );

  const status = STATUS_ORDER.map((statusKey) => {
    const count = activeTasks.filter((task) => task.status === statusKey).length;
    return {
      status: statusKey,
      label: STATUS_LABELS[statusKey],
      count,
      percentage: activeTasks.length > 0 ? Math.round((count / activeTasks.length) * 100) : 0,
    };
  });

  return {
    generatedAt: now.toISOString(),
    totalTasks: activeTasks.length,
    completedTasks,
    openTasks: activeTasks.length - completedTasks,
    completionPercentage: activeTasks.length > 0
      ? Math.round((completedTasks / activeTasks.length) * 100)
      : 0,
    averageCloseDays: nullableRound(average(allCloseDurations)),
    medianCloseDays: nullableRound(median(allCloseDurations)),
    totalTrackedHours: round(totalTrackedMs / 3_600_000),
    status,
    monthly: buildMonthly(project, now),
    users: userMetrics,
    customer: {
      companyId: customerCompanyId,
      companyName: project.primaryCompany?.NAME ?? null,
      openedTasks: customerTasks.length,
      completedTasks: customerTasks.filter((task) => task.status === 'done').length,
      openTasks: customerTasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length,
      averageCloseDays: nullableRound(average(customerCloseDurations)),
      medianCloseDays: nullableRound(median(customerCloseDurations)),
    },
    dgsmart: {
      assignedTasks: dgsmartTaskIds.size,
      completedTasks: dgsmartCompletedTaskIds.size,
      comments: userMetrics.filter((user) => user.isDGSmart).reduce((sum, user) => sum + user.comments, 0),
      activities: userMetrics.filter((user) => user.isDGSmart).reduce((sum, user) => sum + user.activities, 0),
      trackedHours: round(dgsmartTrackedMs / 3_600_000),
      aiAssignedTasks: project.tasks.filter((task) => task.activeAIAgentId).length,
      meetingGeneratedTasks: project.tasks.filter((task) => task.generatedFromMeetingId).length,
      proposalGeneratedTasks: project.tasks.filter((task) => task.generatedFromProposalId).length,
      approvedResolutions: project.tasks.reduce(
        (sum, task) => sum + task.resolutions.filter((resolution) => resolution.status === 'approved').length,
        0,
      ),
    },
  };
}
