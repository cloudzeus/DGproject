'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN, deleteFileFromCDN } from '@/lib/bunnycdn';
import { syncTaskCalendar, removeTaskCalendar } from '@/lib/task-calendar-sync';
import { normalizeToBusinessHours } from '@/lib/business-hours';
import { sendEmail } from '@/lib/mailgun';
import { notifyTaskAssignment, notifyTaskCompleted } from '@/lib/notifications';

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

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function formatDueHtml(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('el-GR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
          startDate: true,
          dueDate: true,
          project: { select: { name: true, color: true } },
        },
      }),
      prisma.user.findMany({
        where: { id: { in: recipientUserIds } },
        select: { email: true, name: true },
      }),
      actorId
        ? prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } })
        : Promise.resolve(null),
    ]);
    if (!task) return;
    const emails = recipients.map((r) => r.email).filter((e): e is string => Boolean(e));
    if (emails.length === 0) return;

    const senderName = actor?.name ?? actor?.email ?? 'A-Sisyphus';
    const link = APP_URL ? `${APP_URL.replace(/\/$/, '')}/board` : '';
    const subject =
      reason === 'assigned'
        ? `Νέα ανάθεση: ${task.title}`
        : `Προστέθηκες στην εργασία: ${task.title}`;
    const verb = reason === 'assigned' ? 'σου ανέθεσε' : 'σε πρόσθεσε στην εργασία';

    const html = `
      <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f1f1f;">
        <div style="border-left:4px solid ${task.project.color};padding-left:16px;margin-bottom:20px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#616161;">${escapeHtml(task.project.name)}</div>
          <h1 style="margin:4px 0 0;font-size:20px;font-weight:600;color:#242424;">${escapeHtml(task.title)}</h1>
        </div>
        <p style="font-size:14px;line-height:1.5;color:#424242;">
          Ο/Η <strong>${escapeHtml(senderName)}</strong> ${verb}.
        </p>
        ${task.description?.trim() ? `<p style="font-size:13px;color:#555;white-space:pre-wrap;">${escapeHtml(task.description)}</p>` : ''}
        <table style="border-collapse:collapse;margin:16px 0;font-size:13px;">
          <tr><td style="padding:4px 12px 4px 0;color:#616161;">Έναρξη</td><td style="padding:4px 0;color:#242424;font-weight:500;">${escapeHtml(formatDueHtml(task.startDate))}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#616161;">Λήξη</td><td style="padding:4px 0;color:#242424;font-weight:500;">${escapeHtml(formatDueHtml(task.dueDate))}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#616161;">Προτεραιότητα</td><td style="padding:4px 0;color:#242424;font-weight:500;">${escapeHtml(task.priority)}</td></tr>
        </table>
        ${link ? `<a href="${link}" style="display:inline-block;background:#0078D4;color:white;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;">Άνοιγμα στο A-Sisyphus</a>` : ''}
      </div>
    `;

    await sendEmail({ to: emails, subject, html });
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

function parseTask(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const statusRaw = String(formData.get('status') ?? 'todo') as TaskStatus;
  const status: TaskStatus = STATUSES.includes(statusRaw) ? statusRaw : 'todo';
  const priorityRaw = String(formData.get('priority') ?? 'medium') as TaskPriority;
  const priority: TaskPriority = PRIORITIES.includes(priorityRaw) ? priorityRaw : 'medium';
  const startDate = parseDateTime(String(formData.get('startDate') ?? ''));
  let dueDate = parseDateTime(String(formData.get('dueDate') ?? ''));
  if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
    dueDate = startDate;
  }
  const hoursRaw = String(formData.get('estimatedHours') ?? '').trim();
  const estimatedHours = hoursRaw ? Number.parseFloat(hoursRaw) : null;
  const assigneeIds = formData.getAll('assigneeIds').map((v) => String(v)).filter(Boolean);
  return { title, description, status, priority, startDate, dueDate, estimatedHours, assigneeIds };
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
      startDate: input.startDate,
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
    select: { status: true, assignees: { select: { userId: true } } },
  });
  const previousAssigneeIds = new Set(previous?.assignees.map((a) => a.userId) ?? []);

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

  if (previous && previous.status !== status) {
    const action: ActivityAction = status === 'done' ? 'completed' : 'moved';
    await logTaskActivity(taskId, projectId, actorId, action, {
      from: previous.status,
      to: status,
    });
    if (status === 'done' && previous.status !== 'done') {
      await notifyTaskCompleted(taskId, actorId);
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
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Το αρχείο υπερβαίνει τα 25MB.' };
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
