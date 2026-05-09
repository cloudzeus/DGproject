import { prisma } from '@/lib/prisma';
import {
  graphIsConfigured,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type TaskCalendarEvent,
} from '@/lib/microsoft-graph';
import { hasTimeComponent } from '@/lib/business-hours';

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function atMidnight(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

type TaskForSync = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  priority: string;
  outlookEventId: string | null;
  project: { name: string; color: string };
  creator: { email: string; name: string | null; azureAdId: string | null };
  assignees: Array<{ user: { email: string; name: string | null; azureAdId: string | null } }>;
};

function buildEventFromTask(task: TaskForSync): TaskCalendarEvent | null {
  if (!task.dueDate) return null;

  const startCandidate = task.startDate ?? task.dueDate;
  const dueCandidate = task.dueDate;
  const isTimed = hasTimeComponent(startCandidate) || hasTimeComponent(dueCandidate);

  let startDate: Date;
  let endDate: Date;
  let isAllDay: boolean;

  if (isTimed) {
    startDate = new Date(startCandidate);
    endDate = new Date(dueCandidate);
    if (endDate.getTime() <= startDate.getTime()) {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
    isAllDay = false;
  } else {
    startDate = atMidnight(task.startDate ?? task.dueDate);
    endDate = addDays(atMidnight(task.dueDate), 1);
    isAllDay = true;
  }

  const link = APP_URL ? `${APP_URL.replace(/\/$/, '')}/board` : '';
  const desc = task.description?.trim() ? `<p>${escapeHtml(task.description)}</p>` : '';
  const projectLine = `<p style="margin:0 0 8px;color:#616161;font-size:12px;">${escapeHtml(task.project.name)} · Προτεραιότητα: ${escapeHtml(task.priority)}</p>`;
  const linkLine = link ? `<p style="margin-top:12px;"><a href="${link}">Άνοιγμα στο A-Sisyphus</a></p>` : '';

  return {
    subject: `[Task] ${task.title}`,
    bodyHtml: `${projectLine}${desc}${linkLine}`,
    startDate,
    endDate,
    isAllDay,
    attendees: task.assignees.map((a) => ({
      email: a.user.email,
      name: a.user.name ?? a.user.email,
    })),
    categories: ['A-Sisyphus'],
  };
}

type TaskForSyncWithFlag = TaskForSync & { addToCalendar: boolean };

async function loadTask(taskId: string): Promise<TaskForSyncWithFlag | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      dueDate: true,
      priority: true,
      outlookEventId: true,
      addToCalendar: true,
      project: { select: { name: true, color: true } },
      creator: { select: { email: true, name: true, azureAdId: true } },
      assignees: {
        include: { user: { select: { email: true, name: true, azureAdId: true } } },
      },
    },
  });
  return task;
}

function resolveOrganizer(task: TaskForSync): string | null {
  if (task.creator.azureAdId) return task.creator.azureAdId;
  const m365Assignee = task.assignees.find((a) => a.user.azureAdId);
  return m365Assignee?.user.azureAdId ?? null;
}

async function clearEventIdOnTask(taskId: string) {
  await prisma.task.update({ where: { id: taskId }, data: { outlookEventId: null } });
}

export async function syncTaskCalendar(taskId: string): Promise<void> {
  if (!graphIsConfigured()) return;

  const task = await loadTask(taskId);
  if (!task) return;

  const organizer = resolveOrganizer(task);
  if (!organizer) return;

  // Flag turned off: if a stored event exists, remove it and clear the id; do nothing otherwise.
  if (!task.addToCalendar) {
    if (task.outlookEventId) {
      try {
        await deleteCalendarEvent(organizer, task.outlookEventId);
      } catch (e) {
        console.warn('[calendar sync] delete (flag off) failed', e);
      }
      await clearEventIdOnTask(task.id);
    }
    return;
  }

  const event = buildEventFromTask(task);

  // Needs deletion: no due date or no assignees, but an event exists.
  if (!event || task.assignees.length === 0) {
    if (task.outlookEventId) {
      try {
        await deleteCalendarEvent(organizer, task.outlookEventId);
      } catch (e) {
        console.warn('[calendar sync] delete failed', e);
      }
      await clearEventIdOnTask(task.id);
    }
    return;
  }

  if (task.outlookEventId) {
    try {
      await updateCalendarEvent(organizer, task.outlookEventId, event);
      return;
    } catch (e) {
      console.warn('[calendar sync] update failed, recreating', e);
      await clearEventIdOnTask(task.id);
    }
  }

  try {
    const eventId = await createCalendarEvent(organizer, event);
    await prisma.task.update({ where: { id: task.id }, data: { outlookEventId: eventId } });
  } catch (e) {
    console.warn('[calendar sync] create failed', e);
  }
}

export async function removeTaskCalendar(taskId: string): Promise<void> {
  if (!graphIsConfigured()) return;

  const task = await loadTask(taskId);
  if (!task || !task.outlookEventId) return;
  const organizer = resolveOrganizer(task);
  if (!organizer) return;

  try {
    await deleteCalendarEvent(organizer, task.outlookEventId);
  } catch (e) {
    console.warn('[calendar sync] delete failed', e);
  }
}
