'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN, deleteFileFromCDN } from '@/lib/bunnycdn';
import { syncTaskCalendar, removeTaskCalendar } from '@/lib/task-calendar-sync';
import { syncTaskTeams, removeTaskTeams } from '@/lib/task-teams-sync';
import {
  emailLayout,
  quote,
  priorityPill,
  priorityLabel,
  formatGreekDateTime,
  escapeHtml,
  appUrl,
  BRAND,
  statRow,
  infoCard,
  personRow,
  sectionHeader,
} from '@/lib/email-templates';
import {
  normalizeToBusinessHours,
  BUSINESS_START_HOUR,
  BUSINESS_START_MINUTE,
} from '@/lib/business-hours';
import { sendEmail } from '@/lib/mailgun';
import { notifyTaskAssignment, notifyTaskCompleted, notifyApprover, createNotifications } from '@/lib/notifications';
import { canApprove, isApprovalGatedTransition, entersReview, isRejection } from '@/lib/approval';
import { computeInProgressTimerUpdate } from '@/lib/task-in-progress-timer';


type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

async function requireProjectEditor(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  // Viewers (clients) are read-only — they can ask/answer questions but never edit tasks.
  if (role === 'viewer') throw new Error('Forbidden: viewer role cannot edit');
  if (role === 'admin' || role === 'manager') return session.user.id;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new Error('Project not found');
  if (project.ownerId !== session.user.id) {
    const isMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: session.user.id } },
    });
    if (!isMember) throw new Error('Forbidden');
  }
  return session.user.id;
}

type ActivityAction = 'created' | 'updated' | 'completed' | 'commented' | 'assigned' | 'moved';

async function logTaskActivity(
  taskId: string,
  projectId: string,
  actorId: string,
  action: ActivityAction,
  metadata?: Record<string, unknown>,
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) return;
    await prisma.activity.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        taskId,
        actorId,
        action,
        targetType: 'task',
        metadata: metadata ? (metadata as object) : undefined,
      },
    });
  } catch (e) {
    console.warn('[activity] failed to log', e);
  }
}

async function notifyAssignees(
  taskId: string,
  recipientUserIds: string[],
  actorId: string,
  reason: 'assigned' | 'added',
) {
  if (recipientUserIds.length === 0) return;
  try {
    const [task, recipients, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          description: true,
          priority: true,
          status: true,
          startDate: true,
          dueDate: true,
          estimatedHours: true,
          project: { select: { id: true, name: true, color: true } },
          assignees: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      }),
      prisma.user.findMany({
        where: { id: { in: recipientUserIds } },
        select: { id: true, email: true, name: true },
      }),
      actorId
        ? prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } })
        : Promise.resolve(null),
    ]);
    if (!task) return;

    const senderName = actor?.name ?? actor?.email ?? 'A-Sisyphus';
    const subject =
      reason === 'assigned'
        ? `[${task.project.name}] Νέα ανάθεση: ${task.title}`
        : `[${task.project.name}] Προστέθηκες στην εργασία: ${task.title}`;
    const verb = reason === 'assigned' ? 'σου ανέθεσε' : 'σε πρόσθεσε στην εργασία';

    // Stats tiles: priority, due, hours. They give the recipient an at-a-glance brief.
    const dueLabel = task.dueDate ? formatGreekDateTime(task.dueDate) : '—';
    const dueDays = task.dueDate
      ? Math.round((task.dueDate.getTime() - Date.now()) / 86400000)
      : null;
    const dueTone: 'default' | 'danger' | 'warning' | 'info' =
      dueDays === null ? 'default' : dueDays < 0 ? 'danger' : dueDays <= 1 ? 'warning' : 'info';

    const tiles = [
      { label: 'Προτεραιότητα', value: priorityLabel(task.priority), tone: 'default' as const },
      { label: 'Λήξη', value: task.dueDate ? formatGreekDateTime(task.dueDate) : 'Χωρίς ημερ.', tone: dueTone },
      ...(task.estimatedHours
        ? [{ label: 'Εκτιμώμενες ώρες', value: `${task.estimatedHours}h`, tone: 'default' as const }]
        : []),
    ];

    // Co-assignees other than the recipient list — gives "who else is on this".
    const coAssignees = task.assignees
      .filter((a) => !recipientUserIds.includes(a.user.id))
      .map((a) => a.user);

    const teamLines: string[] = [];
    if (actor) {
      teamLines.push(
        personRow({
          name: senderName,
          email: actor.email ?? undefined,
          badge: { label: 'CREATOR', color: BRAND.primary },
        }),
      );
    }
    for (const u of coAssignees) {
      teamLines.push(personRow({ name: u.name ?? u.email, email: u.email }));
    }

    // Build a per-recipient email so the greeting is personalized. Falls back
    // to a single broadcast if name resolution fails.
    for (const r of recipients) {
      if (!r.email) continue;
      const recipientName = r.name ?? r.email;

      const body = `
        <p style="font-size:14px;line-height:1.55;color:${BRAND.text};margin:0 0 14px;">
          Ο/Η <strong>${escapeHtml(senderName)}</strong> ${verb}.
        </p>
        ${statRow(tiles)}
        ${task.description?.trim() ? quote({ body: task.description, tone: 'neutral', caption: 'Περιγραφή' }) : ''}
        ${
          task.startDate
            ? `<p style="font-size:12px;color:${BRAND.textSoft};margin:0 0 16px;">⏱ Έναρξη: <strong style="color:${BRAND.text};">${escapeHtml(formatGreekDateTime(task.startDate))}</strong>${
                task.dueDate
                  ? ` · Λήξη: <strong style="color:${BRAND.text};">${escapeHtml(dueLabel)}</strong>`
                  : ''
              }</p>`
            : ''
        }
        ${
          teamLines.length > 0
            ? `${sectionHeader({ label: 'Ομάδα εργασίας', color: BRAND.primary })}${infoCard(teamLines.join(''))}`
            : ''
        }
      `;

      const html = emailLayout({
        recipientName,
        header: {
          kicker: {
            text: reason === 'assigned' ? '👤 Νέα ανάθεση' : '👥 Προστέθηκες στην εργασία',
            tone: 'info',
          },
          eyebrow: { text: task.project.name, color: task.project.color },
          title: task.title,
          pillsHtml: priorityPill(task.priority),
        },
        body,
        actions: [
          { label: 'Άνοιγμα εργασίας', url: appUrl('/board'), variant: 'primary' },
          { label: 'Άνοιγμα έργου', url: appUrl(`/projects/${task.project.id}`), variant: 'secondary' },
        ],
        footerNote: 'Αν δεν χρειάζεται να βλέπεις αυτές τις ειδοποιήσεις, ενημέρωσε τον διαχειριστή.',
      });

      await sendEmail({ to: r.email, subject, html });
    }
  } catch (e) {
    console.warn('[task notify] failed', e);
  }
}

function parseDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return normalizeToBusinessHours(d);
}

/**
 * Parses a `<input type="datetime-local">` value and reports whether the user
 * actually picked a time. Browsers default the time portion to `00:00` when only
 * a date is typed, so we use that as the "no time specified" signal.
 */
function parseDateTimeWithIntent(
  raw: string,
): { value: Date; hasUserTime: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const hasUserTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return { value: normalizeToBusinessHours(d), hasUserTime };
}

function parseTask(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const statusRaw = String(formData.get('status') ?? 'todo') as TaskStatus;
  const status: TaskStatus = STATUSES.includes(statusRaw) ? statusRaw : 'todo';
  const priorityRaw = String(formData.get('priority') ?? 'medium') as TaskPriority;
  const priority: TaskPriority = PRIORITIES.includes(priorityRaw) ? priorityRaw : 'medium';
  const startInfo = parseDateTimeWithIntent(String(formData.get('startDate') ?? ''));
  const dueInfoRaw = parseDateTimeWithIntent(String(formData.get('dueDate') ?? ''));
  let startDate = startInfo?.value ?? null;
  let dueDate = dueInfoRaw?.value ?? null;
  if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
    dueDate = startDate;
  }
  // The user "specified a time" if either input has a non-midnight time component.
  // Used downstream to decide whether to auto-slot the task on the day's calendar.
  const userSpecifiedTime = Boolean(startInfo?.hasUserTime || dueInfoRaw?.hasUserTime);
  const hoursRaw = String(formData.get('estimatedHours') ?? '').trim();
  const estimatedHours = hoursRaw ? Number.parseFloat(hoursRaw) : null;
  const assigneeIds = formData.getAll('assigneeIds').map((v) => String(v)).filter(Boolean);
  const dependencyIds = formData.getAll('dependencyIds').map((v) => String(v)).filter(Boolean);
  // Sync flags: HTML checkboxes only POST when checked, so absence means false.
  const addToCalendar = String(formData.get('addToCalendar') ?? '') === 'on';
  const addToTeams = String(formData.get('addToTeams') ?? '') === 'on';
  return {
    title,
    description,
    status,
    priority,
    startDate,
    dueDate,
    userSpecifiedTime,
    estimatedHours,
    assigneeIds,
    dependencyIds,
    addToCalendar,
    addToTeams,
  };
}

/**
 * Validates that adding `newDepIds` as dependencies of `taskId` won't create a
 * cycle in the project's dependency graph. Returns null on success or an error
 * message describing the offender.
 *
 * A cycle exists if any new dependency D can already (transitively) reach
 * taskId by following its own dependsOn → dependsOn chain.
 */
async function validateNoDependencyCycle(
  projectId: string,
  taskId: string | null, // null when creating; we still want self-reference protection
  newDepIds: string[],
): Promise<string | null> {
  if (newDepIds.length === 0) return null;
  if (taskId && newDepIds.includes(taskId)) {
    return 'Μια εργασία δεν μπορεί να εξαρτάται από τον εαυτό της.';
  }

  // Verify all candidates belong to this project (prevents cross-project links).
  const candidates = await prisma.task.findMany({
    where: { id: { in: newDepIds }, projectId },
    select: { id: true, title: true },
  });
  if (candidates.length !== newDepIds.length) {
    return 'Μία ή περισσότερες προαπαιτούμενες εργασίες δεν ανήκουν σε αυτό το έργο.';
  }

  // No need to BFS for cycles when creating (taskId is null) — there's no edge
  // pointing back at us yet.
  if (!taskId) return null;

  const allEdges = await prisma.taskDependency.findMany({
    where: { task: { projectId } },
    select: { taskId: true, dependsOnId: true },
  });
  const adj = new Map<string, Set<string>>();
  for (const e of allEdges) {
    if (e.taskId === taskId) continue; // these will be replaced
    let set = adj.get(e.taskId);
    if (!set) {
      set = new Set();
      adj.set(e.taskId, set);
    }
    set.add(e.dependsOnId);
  }

  for (const dep of newDepIds) {
    const seen = new Set<string>();
    const stack: string[] = [dep];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === taskId) {
        return 'Δεν επιτρέπεται κυκλική εξάρτηση μεταξύ εργασιών.';
      }
      if (seen.has(cur)) continue;
      seen.add(cur);
      const next = adj.get(cur);
      if (!next) continue;
      for (const n of next) stack.push(n);
    }
  }
  return null;
}

/** Returns the latest dueDate among the given dependency tasks (in this project). */
async function latestDependencyDue(dependencyIds: string[]): Promise<Date | null> {
  if (dependencyIds.length === 0) return null;
  const deps = await prisma.task.findMany({
    where: { id: { in: dependencyIds } },
    select: { dueDate: true },
  });
  let latest: number = 0;
  for (const d of deps) {
    if (!d.dueDate) continue;
    const t = d.dueDate.getTime();
    if (t > latest) latest = t;
  }
  return latest > 0 ? new Date(latest) : null;
}

/**
 * When the creator hasn't specified an explicit time, slot the new task
 * sequentially on their day: start at 9:00 AM, or right after the last task
 * scheduled on the same day (whichever is later). Duration defaults to 1h
 * unless `estimatedHours` was provided.
 *
 * Considers tasks created BY this user OR assigned TO this user, since either
 * counts as "their day" for calendar conflict purposes. Excludes the current
 * task id when updating.
 */
async function computeAutoSlotForCreator(params: {
  creatorId: string;
  assigneeIds: string[];
  targetDay: Date;
  durationHours: number;
  excludeTaskId?: string;
  // Earliest moment the task is allowed to begin (e.g. after the latest dependency dueDate)
  notBefore?: Date | null;
}): Promise<{ startDate: Date; dueDate: Date }> {
  const { creatorId, assigneeIds, durationHours, excludeTaskId, notBefore } = params;

  // If a dependency forces a later day than the user picked, jump to that day instead.
  let effectiveTarget = params.targetDay;
  if (notBefore && notBefore.getTime() > effectiveTarget.getTime()) {
    effectiveTarget = notBefore;
  }

  const dayStart = new Date(effectiveTarget);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const userIds = Array.from(new Set([creatorId, ...assigneeIds].filter(Boolean)));

  const sameDayTasks = await prisma.task.findMany({
    where: {
      ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}),
      startDate: { gte: dayStart, lt: dayEnd },
      dueDate: { not: null },
      OR: [{ createdById: { in: userIds } }, { assignees: { some: { userId: { in: userIds } } } }],
    },
    select: { startDate: true, dueDate: true },
  });

  // Baseline: 09:00 on the target day.
  const baseline = new Date(dayStart);
  baseline.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0);

  let earliestStart = baseline.getTime();
  for (const t of sameDayTasks) {
    if (!t.dueDate) continue;
    if (t.dueDate.getTime() > earliestStart) earliestStart = t.dueDate.getTime();
  }
  // Push past dependency end if it lands inside this same day.
  if (notBefore && notBefore.getTime() > earliestStart) {
    earliestStart = notBefore.getTime();
  }

  const startDate = new Date(earliestStart);
  const startNormalized = normalizeToBusinessHours(startDate);
  const durationMs = Math.max(durationHours, 0.25) * 60 * 60 * 1000;
  const dueDate = new Date(startNormalized.getTime() + durationMs);
  return { startDate: startNormalized, dueDate };
}

export async function createTask(projectId: string, formData: FormData) {
  const actorId = await requireProjectEditor(projectId);
  const input = parseTask(formData);
  if (input.title.length < 2) return { ok: false, error: 'Ο τίτλος είναι πολύ σύντομος.' };
  if (input.estimatedHours !== null && (Number.isNaN(input.estimatedHours) || input.estimatedHours < 0)) {
    return { ok: false, error: 'Μη έγκυρες ώρες.' };
  }

  // Validate dependencies (same project, no cycles).
  const cycleErr = await validateNoDependencyCycle(projectId, null, input.dependencyIds);
  if (cycleErr) return { ok: false, error: cycleErr };

  // If the user didn't pick a date but selected dependencies, schedule starting
  // right after the latest dependency's due date.
  const depDeadline = await latestDependencyDue(input.dependencyIds);
  if (!input.startDate && !input.dueDate && depDeadline) {
    input.startDate = depDeadline;
    input.dueDate = depDeadline;
    input.userSpecifiedTime = false; // let auto-slot place it after the dep
  }

  // Auto-slot: when the user picked a date but not a time, place the task at 9am
  // (or right after the last task that day for this user/their assignees), with
  // duration = estimatedHours or 1h. Dependency end-times also push the start.
  if (!input.userSpecifiedTime && (input.startDate || input.dueDate)) {
    const targetDay = (input.dueDate ?? input.startDate)!;
    const hours = input.estimatedHours && input.estimatedHours > 0 ? input.estimatedHours : 1;
    const slot = await computeAutoSlotForCreator({
      creatorId: actorId,
      assigneeIds: input.assigneeIds,
      targetDay,
      durationHours: hours,
      notBefore: depDeadline,
    });
    input.startDate = slot.startDate;
    input.dueDate = slot.dueDate;
  } else if (input.userSpecifiedTime && depDeadline && input.startDate && input.startDate.getTime() < depDeadline.getTime()) {
    // User explicitly set a time but it falls before a prerequisite — surface a clear error.
    return {
      ok: false,
      error:
        'Η ώρα έναρξης είναι πριν την ολοκλήρωση των προαπαιτούμενων εργασιών. Άλλαξε την ώρα ή αφαίρεσε την εξάρτηση.',
    };
  }

  const maxOrder = await prisma.task.aggregate({ where: { projectId }, _max: { order: true } });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  // Start the in_progress wall-clock immediately if the task is created
  // already in that state. No prior status, no accumulated time yet.
  const timerFields = computeInProgressTimerUpdate(null, input.status, null, 0n);

  const created = await prisma.task.create({
    data: {
      projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      startDate: input.startDate,
      dueDate: input.dueDate,
      estimatedHours: input.estimatedHours ?? undefined,
      order: nextOrder,
      createdById: actorId,
      completedAt: input.status === 'done' ? new Date() : null,
      addToCalendar: input.addToCalendar,
      addToTeams: input.addToTeams,
      ...timerFields,
      assignees: {
        create: input.assigneeIds.map((userId) => ({ userId })),
      },
      dependencies: {
        create: input.dependencyIds.map((dependsOnId) => ({ dependsOnId })),
      },
    },
    select: { id: true },
  });

  await syncTaskCalendar(created.id);
  await syncTaskTeams(created.id);
  await logTaskActivity(created.id, projectId, actorId, 'created');
  if (input.assigneeIds.length > 0) {
    await notifyAssignees(created.id, input.assigneeIds, actorId, 'assigned');
    await notifyTaskAssignment(created.id, input.assigneeIds, actorId);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateTask(projectId: string, taskId: string, formData: FormData) {
  await requireProjectEditor(projectId);
  const input = parseTask(formData);
  if (input.title.length < 2) return { ok: false, error: 'Ο τίτλος είναι πολύ σύντομος.' };
  if (input.estimatedHours !== null && (Number.isNaN(input.estimatedHours) || input.estimatedHours < 0)) {
    return { ok: false, error: 'Μη έγκυρες ώρες.' };
  }

  const previous = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      createdById: true,
      inProgressStartedAt: true,
      inProgressAccumulatedMs: true,
      assignees: { select: { userId: true } },
    },
  });
  const previousAssigneeIds = new Set(previous?.assignees.map((a) => a.userId) ?? []);

  // Validate dependencies (same project, no cycles, no self-reference).
  const cycleErr = await validateNoDependencyCycle(projectId, taskId, input.dependencyIds);
  if (cycleErr) return { ok: false, error: cycleErr };

  // Same auto-slot logic as createTask, but excluding the current task to avoid
  // pushing it past itself when the user only changed unrelated fields. Also
  // respect dependency due dates.
  const depDeadline = await latestDependencyDue(input.dependencyIds);
  if (!input.startDate && !input.dueDate && depDeadline) {
    input.startDate = depDeadline;
    input.dueDate = depDeadline;
    input.userSpecifiedTime = false;
  }
  if (!input.userSpecifiedTime && (input.startDate || input.dueDate)) {
    const targetDay = (input.dueDate ?? input.startDate)!;
    const hours = input.estimatedHours && input.estimatedHours > 0 ? input.estimatedHours : 1;
    const slot = await computeAutoSlotForCreator({
      creatorId: previous?.createdById ?? '',
      assigneeIds: input.assigneeIds,
      targetDay,
      durationHours: hours,
      excludeTaskId: taskId,
      notBefore: depDeadline,
    });
    input.startDate = slot.startDate;
    input.dueDate = slot.dueDate;
  } else if (input.userSpecifiedTime && depDeadline && input.startDate && input.startDate.getTime() < depDeadline.getTime()) {
    return {
      ok: false,
      error:
        'Η ώρα έναρξης είναι πριν την ολοκλήρωση των προαπαιτούμενων εργασιών. Άλλαξε την ώρα ή αφαίρεσε την εξάρτηση.',
    };
  }

  const updateTimerFields = computeInProgressTimerUpdate(
    previous?.status ?? null,
    input.status,
    previous?.inProgressStartedAt ?? null,
    previous?.inProgressAccumulatedMs ?? 0n,
  );

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        estimatedHours: input.estimatedHours,
        addToCalendar: input.addToCalendar,
        addToTeams: input.addToTeams,
        completedAt:
          input.status === 'done' && previous?.status !== 'done'
            ? new Date()
            : input.status !== 'done'
            ? null
            : undefined,
        ...updateTimerFields,
      },
    }),
    prisma.taskAssignee.deleteMany({ where: { taskId } }),
    // Replace the dependency edges in the same transaction so partial state never leaks.
    prisma.taskDependency.deleteMany({ where: { taskId } }),
    ...(input.dependencyIds.length
      ? [
          prisma.taskDependency.createMany({
            data: input.dependencyIds.map((dependsOnId) => ({ taskId, dependsOnId })),
          }),
        ]
      : []),
    ...(input.assigneeIds.length
      ? [
          prisma.taskAssignee.createMany({
            data: input.assigneeIds.map((userId) => ({ taskId, userId })),
          }),
        ]
      : []),
  ]);

  await syncTaskCalendar(taskId);
  await syncTaskTeams(taskId);

  const session = await auth();
  const actorId = session?.user?.id ?? '';

  const statusChanged = previous && previous.status !== input.status;
  if (statusChanged) {
    const action: ActivityAction = input.status === 'done' ? 'completed' : 'moved';
    await logTaskActivity(taskId, projectId, actorId, action, {
      from: previous!.status,
      to: input.status,
    });
  } else {
    await logTaskActivity(taskId, projectId, actorId, 'updated');
  }

  const addedAssigneeIds = input.assigneeIds.filter((id) => !previousAssigneeIds.has(id));
  if (addedAssigneeIds.length > 0) {
    await notifyAssignees(taskId, addedAssigneeIds, actorId, 'added');
    await notifyTaskAssignment(taskId, addedAssigneeIds, actorId);
    await logTaskActivity(taskId, projectId, actorId, 'assigned', {
      userIds: addedAssigneeIds,
    });
  }

  if (previous && previous.status !== 'done' && input.status === 'done') {
    await notifyTaskCompleted(taskId, actorId);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateTaskStatus(projectId: string, taskId: string, status: TaskStatus) {
  const actorId = await requireProjectEditor(projectId);
  if (!STATUSES.includes(status)) return { ok: false, error: 'Μη έγκυρη κατάσταση.' };

  const session = await auth();
  const actorRole = session?.user?.role ?? 'member';

  const [previous, project] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        inProgressStartedAt: true,
        inProgressAccumulatedMs: true,
        title: true,
        createdById: true,
      },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { approverId: true, ownerId: true, name: true },
    }),
  ]);
  if (!previous || !project) return { ok: false, error: 'Δεν βρέθηκε.' };

  const from = previous?.status ?? null;

  if (
    isApprovalGatedTransition(project.approverId, from, status) &&
    !canApprove({ approverId: project.approverId, ownerId: project.ownerId, userId: actorId, userRole: actorRole })
  ) {
    return { ok: false, error: 'Μόνο ο υπεύθυνος έγκρισης (approver) μπορεί να εγκρίνει αυτή την εργασία.' };
  }

  const timerFields = computeInProgressTimerUpdate(
    previous?.status ?? null,
    status,
    previous?.inProgressStartedAt ?? null,
    previous?.inProgressAccumulatedMs ?? 0n,
  );
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      completedAt:
        status === 'done' && previous?.status !== 'done'
          ? new Date()
          : status !== 'done'
          ? null
          : undefined,
      ...timerFields,
    },
  });

  if (previous && previous.status !== status) {
    const action: ActivityAction = status === 'done' ? 'completed' : 'moved';
    await logTaskActivity(taskId, projectId, actorId, action, { from: previous.status, to: status });

    // Approval-request notification: task entered review.
    if (project.approverId && entersReview(from, status)) {
      await notifyApprover(
        projectId,
        actorId,
        {
          title: 'Εργασία για έγκριση',
          message: `Η εργασία «${previous.title}» στο έργο ${project.name} περιμένει την έγκρισή σου.`,
          type: 'approval',
          link: '/board',
        },
        [],
      );
    }

    // Approval decision notifications to creator + assignees.
    if (project.approverId && (status === 'done' || isRejection(from, status))) {
      const assignees = await prisma.taskAssignee.findMany({
        where: { taskId },
        select: { userId: true },
      });
      const recipients = new Set<string>([previous.createdById, ...assignees.map((a) => a.userId)]);
      recipients.delete(actorId);
      const decided = status === 'done';
      await createNotifications(
        Array.from(recipients).map((userId) => ({
          userId,
          title: decided ? 'Εργασία εγκρίθηκε' : 'Ζητήθηκαν αλλαγές',
          message: decided
            ? `Η εργασία «${previous.title}» εγκρίθηκε.`
            : `Ζητήθηκαν αλλαγές στην εργασία «${previous.title}».`,
          type: 'approval' as const,
          link: '/board',
        })),
      );
    }

    if (status === 'done' && previous.status !== 'done') {
      await notifyTaskCompleted(taskId, actorId);
    }

    // Firehose: approver hears about every status change. Dedup only on
    // entersReview, where the approver already got the "request" notification
    // above; on done/reject the decision notifications went to creator +
    // assignees (never the approver), so the approver is informed via this
    // firehose. When the actor IS the approver, notifyApprover self-suppresses.
    if (project.approverId) {
      await notifyApprover(
        projectId,
        actorId,
        {
          title: 'Αλλαγή κατάστασης εργασίας',
          message: `Η εργασία «${previous.title}»: ${previous.status} → ${status}.`,
          type: 'status_change',
          link: '/board',
        },
        entersReview(from, status) ? [project.approverId ?? ''] : [],
      );
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function deleteTask(projectId: string, taskId: string) {
  await requireProjectEditor(projectId);
  await removeTaskCalendar(taskId);
  await removeTaskTeams(taskId);
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateTaskDates(
  projectId: string,
  taskId: string,
  dates: { startDate: Date | null; dueDate: Date | null },
) {
  await requireProjectEditor(projectId);
  await prisma.task.update({
    where: { id: taskId },
    data: { startDate: dates.startDate, dueDate: dates.dueDate },
  });
  await syncTaskCalendar(taskId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/timeline');
  return { ok: true };
}

export async function uploadTaskAttachment(projectId: string, taskId: string, formData: FormData) {
  const actorId = await requireProjectEditor(projectId);
  const file = formData.get('file');
  const title = String(formData.get('title') ?? '').trim() || null;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Δεν επιλέχθηκε αρχείο.' };
  }

  const taskExists = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!taskExists) return { ok: false, error: 'Η εργασία δεν βρέθηκε.' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const storedName = `${Date.now()}-${safeName}`;

  try {
    const uploaded = await uploadFileToCDN({
      file: buffer,
      filename: storedName,
      folder: `tasks/${taskId}`,
      contentType: file.type || 'application/octet-stream',
    });

    await prisma.attachment.create({
      data: {
        taskId,
        projectId,
        name: file.name,
        title,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: uploaded.url,
        source: 'local',
        uploadedById: actorId,
      },
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/files');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Αποτυχία μεταφόρτωσης στο CDN.' };
  }
}

export async function deleteTaskAttachment(projectId: string, attachmentId: string) {
  await requireProjectEditor(projectId);
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return { ok: false, error: 'Το συνημμένο δεν βρέθηκε.' };
  if (attachment.taskId) {
    const task = await prisma.task.findUnique({ where: { id: attachment.taskId }, select: { projectId: true } });
    if (task && task.projectId !== projectId) return { ok: false, error: 'Forbidden.' };
  }

  // Best-effort CDN delete: derive storage path from the public URL
  try {
    const url = new URL(attachment.url);
    const storagePath = url.pathname.replace(/^\/+/, '');
    if (storagePath) await deleteFileFromCDN(storagePath);
  } catch {
    // Ignore CDN errors — DB deletion is source of truth.
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/files');
  return { ok: true };
}

export async function uploadProjectAttachment(projectId: string, formData: FormData) {
  const actorId = await requireProjectEditor(projectId);
  const file = formData.get('file');
  const title = String(formData.get('title') ?? '').trim() || null;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Δεν επιλέχθηκε αρχείο.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const storedName = `${Date.now()}-${safeName}`;

  try {
    const uploaded = await uploadFileToCDN({
      file: buffer,
      filename: storedName,
      folder: `projects/${projectId}`,
      contentType: file.type || 'application/octet-stream',
    });
    await prisma.attachment.create({
      data: {
        projectId,
        name: file.name,
        title,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: uploaded.url,
        source: 'local',
        uploadedById: actorId,
      },
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/files');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Αποτυχία μεταφόρτωσης στο CDN.' };
  }
}

export async function deleteProjectAttachment(projectId: string, attachmentId: string) {
  await requireProjectEditor(projectId);
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return { ok: false, error: 'Το συνημμένο δεν βρέθηκε.' };
  if (attachment.projectId !== projectId) return { ok: false, error: 'Forbidden.' };

  try {
    const url = new URL(attachment.url);
    const storagePath = url.pathname.replace(/^\/+/, '');
    if (storagePath) await deleteFileFromCDN(storagePath);
  } catch {
    // best-effort
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/files');
  return { ok: true };
}

export async function setTaskAssignee(projectId: string, taskId: string, userId: string | null) {
  await requireProjectEditor(projectId);
  await prisma.taskAssignee.deleteMany({ where: { taskId } });
  if (userId) {
    await prisma.taskAssignee.create({ data: { taskId, userId } });
  }
  await syncTaskCalendar(taskId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/timeline');
  return { ok: true };
}
