import { prisma } from '@/lib/prisma';
import type { NotificationType } from '@prisma/client';

type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
};

export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: inputs.map((n) => ({
        userId: n.userId,
        title: n.title,
        message: n.message,
        type: n.type,
        link: n.link,
      })),
    });
  } catch (e) {
    console.warn('[notifications] create failed', e);
  }
}

export async function notifyTaskAssignment(
  taskId: string,
  newAssigneeIds: string[],
  actorId: string,
): Promise<void> {
  if (newAssigneeIds.length === 0) return;

  const [task, actor] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: {
        title: true,
        project: { select: { name: true } },
      },
    }),
    actorId
      ? prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } })
      : Promise.resolve(null),
  ]);
  if (!task) return;

  const actorName = actor?.name ?? actor?.email ?? 'Κάποιος';
  const recipients = newAssigneeIds.filter((id) => id !== actorId);

  await createNotifications(
    recipients.map((userId) => ({
      userId,
      title: 'Νέα ανάθεση εργασίας',
      message: `Ο/Η ${actorName} σου ανέθεσε την εργασία "${task.title}" στο έργο ${task.project.name}.`,
      type: 'assignment',
      link: '/board',
    })),
  );
}

export async function notifyTaskCompleted(
  taskId: string,
  actorId: string,
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      createdById: true,
      project: { select: { ownerId: true, name: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!task) return;

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true, email: true },
  });
  const actorName = actor?.name ?? actor?.email ?? 'Κάποιος';

  const recipientSet = new Set<string>();
  recipientSet.add(task.createdById);
  recipientSet.add(task.project.ownerId);
  task.assignees.forEach((a) => recipientSet.add(a.userId));
  recipientSet.delete(actorId);

  await createNotifications(
    Array.from(recipientSet).map((userId) => ({
      userId,
      title: 'Εργασία ολοκληρώθηκε',
      message: `Ο/Η ${actorName} ολοκλήρωσε την εργασία "${task.title}" στο έργο ${task.project.name}.`,
      type: 'status_change',
      link: '/board',
    })),
  );
}

/**
 * Notify a project's approver of a task event. Guarantees EXACTLY-ONCE delivery:
 * does nothing when there is no approver, when the approver is the actor, or when
 * the approver is already in `alreadyNotified` (so owners/assignees who are also
 * the approver never get a duplicate for the same event).
 */
export async function notifyApprover(
  projectId: string,
  actorId: string,
  payload: { title: string; message: string; type: NotificationType; link?: string },
  alreadyNotified: string[] = [],
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { approverId: true },
  });
  const approverId = project?.approverId;
  if (!approverId) return;
  if (approverId === actorId) return;
  if (alreadyNotified.includes(approverId)) return;

  await createNotifications([
    {
      userId: approverId,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      link: payload.link,
    },
  ]);
}
