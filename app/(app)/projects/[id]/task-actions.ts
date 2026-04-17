'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN, deleteFileFromCDN } from '@/lib/bunnycdn';
import { syncTaskCalendar, removeTaskCalendar } from '@/lib/task-calendar-sync';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

async function requireProjectEditor(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
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

function parseTask(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const statusRaw = String(formData.get('status') ?? 'todo') as TaskStatus;
  const status: TaskStatus = STATUSES.includes(statusRaw) ? statusRaw : 'todo';
  const priorityRaw = String(formData.get('priority') ?? 'medium') as TaskPriority;
  const priority: TaskPriority = PRIORITIES.includes(priorityRaw) ? priorityRaw : 'medium';
  const dueRaw = String(formData.get('dueDate') ?? '').trim();
  const dueDate = dueRaw ? new Date(dueRaw) : null;
  const hoursRaw = String(formData.get('estimatedHours') ?? '').trim();
  const estimatedHours = hoursRaw ? Number.parseFloat(hoursRaw) : null;
  const assigneeIds = formData.getAll('assigneeIds').map((v) => String(v)).filter(Boolean);
  return { title, description, status, priority, dueDate, estimatedHours, assigneeIds };
}

export async function createTask(projectId: string, formData: FormData) {
  const actorId = await requireProjectEditor(projectId);
  const input = parseTask(formData);
  if (input.title.length < 2) return { ok: false, error: 'Ο τίτλος είναι πολύ σύντομος.' };
  if (input.estimatedHours !== null && (Number.isNaN(input.estimatedHours) || input.estimatedHours < 0)) {
    return { ok: false, error: 'Μη έγκυρες ώρες.' };
  }

  const maxOrder = await prisma.task.aggregate({ where: { projectId }, _max: { order: true } });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const created = await prisma.task.create({
    data: {
      projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      estimatedHours: input.estimatedHours ?? undefined,
      order: nextOrder,
      createdById: actorId,
      completedAt: input.status === 'done' ? new Date() : null,
      assignees: {
        create: input.assigneeIds.map((userId) => ({ userId })),
      },
    },
    select: { id: true },
  });

  await syncTaskCalendar(created.id);

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

  const previous = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate,
        estimatedHours: input.estimatedHours,
        completedAt:
          input.status === 'done' && previous?.status !== 'done'
            ? new Date()
            : input.status !== 'done'
            ? null
            : undefined,
      },
    }),
    prisma.taskAssignee.deleteMany({ where: { taskId } }),
    ...(input.assigneeIds.length
      ? [
          prisma.taskAssignee.createMany({
            data: input.assigneeIds.map((userId) => ({ taskId, userId })),
          }),
        ]
      : []),
  ]);

  await syncTaskCalendar(taskId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateTaskStatus(projectId: string, taskId: string, status: TaskStatus) {
  await requireProjectEditor(projectId);
  if (!STATUSES.includes(status)) return { ok: false, error: 'Μη έγκυρη κατάσταση.' };

  const previous = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
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
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteTask(projectId: string, taskId: string) {
  await requireProjectEditor(projectId);
  await removeTaskCalendar(taskId);
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
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Δεν επιλέχθηκε αρχείο.' };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Το αρχείο υπερβαίνει τα 25MB.' };
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
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: uploaded.url,
        source: 'local',
        uploadedById: actorId,
      },
    });

    revalidatePath(`/projects/${projectId}`);
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
