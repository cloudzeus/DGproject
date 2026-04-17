'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailgun';
import type { TaskStatus } from '@prisma/client';

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

async function requireTaskEditor(taskId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role === 'admin' || role === 'manager') return session.user.id;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      createdById: true,
      assignees: { select: { userId: true } },
      project: { select: { ownerId: true, members: { select: { userId: true } } } },
    },
  });
  if (!task) throw new Error('Task not found');

  const uid = session.user.id;
  const isOwnerOrMember =
    task.project.ownerId === uid ||
    task.project.members.some((m) => m.userId === uid) ||
    task.assignees.some((a) => a.userId === uid) ||
    task.createdById === uid;

  if (!isOwnerOrMember) throw new Error('Forbidden');
  return uid;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  if (!STATUSES.includes(status)) return { ok: false, error: 'Invalid status.' };
  const userId = await requireTaskEditor(taskId);

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === 'done' ? new Date() : null,
    },
    select: { projectId: true, project: { select: { workspaceId: true } } },
  });

  await prisma.activity.create({
    data: {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId: userId,
      action: status === 'done' ? 'completed' : 'moved',
      targetType: 'task',
      metadata: { to: status },
    },
  });

  revalidatePath('/board');
  revalidatePath('/dashboard');
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

function formatDue(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendTaskReminder(taskId: string, customMessage?: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      priority: true,
      status: true,
      projectId: true,
      project: { select: { ownerId: true, name: true, color: true, members: { select: { userId: true } } } },
      assignees: { include: { user: { select: { id: true, email: true, name: true } } } },
      createdById: true,
    },
  });
  if (!task) return { ok: false, error: 'Η εργασία δεν βρέθηκε.' };

  const uid = session.user.id;
  const role = session.user.role;
  const authorized =
    role === 'admin' ||
    role === 'manager' ||
    task.project.ownerId === uid ||
    task.project.members.some((m) => m.userId === uid) ||
    task.assignees.some((a) => a.userId === uid) ||
    task.createdById === uid;
  if (!authorized) return { ok: false, error: 'Forbidden' };

  const recipients = task.assignees
    .map((a) => a.user.email)
    .filter((e): e is string => Boolean(e));
  if (recipients.length === 0) return { ok: false, error: 'Η εργασία δεν έχει ανατεθεί σε κάποιον χρήστη.' };

  const sender = session.user.name ?? session.user.email ?? 'A-Sisyphus';
  const link = APP_URL ? `${APP_URL.replace(/\/$/, '')}/board` : '';
  const safeTitle = escapeHtml(task.title);
  const safeProject = escapeHtml(task.project.name);
  const safeSender = escapeHtml(sender);
  const safeMessage = customMessage?.trim() ? escapeHtml(customMessage.trim()) : null;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f1f1f;">
      <div style="border-left: 4px solid ${task.project.color}; padding-left: 16px; margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #616161;">${safeProject}</div>
        <h1 style="margin: 4px 0 0; font-size: 20px; font-weight: 600; color: #242424;">${safeTitle}</h1>
      </div>
      <p style="font-size: 14px; line-height: 1.5; color: #424242;">
        Υπενθύμιση από τον/την <strong>${safeSender}</strong>.
      </p>
      ${safeMessage ? `<div style="background: #F5F5F5; border-radius: 6px; padding: 12px 14px; margin: 12px 0; font-size: 14px; white-space: pre-wrap; color: #333;">${safeMessage}</div>` : ''}
      <table style="border-collapse: collapse; margin: 16px 0; font-size: 13px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #616161;">Προθεσμία</td><td style="padding: 4px 0; color: #242424; font-weight: 500;">${escapeHtml(formatDue(task.dueDate))}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #616161;">Προτεραιότητα</td><td style="padding: 4px 0; color: #242424; font-weight: 500;">${escapeHtml(task.priority)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #616161;">Κατάσταση</td><td style="padding: 4px 0; color: #242424; font-weight: 500;">${escapeHtml(task.status)}</td></tr>
      </table>
      ${link ? `<a href="${link}" style="display: inline-block; background: #0078D4; color: white; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 600;">Άνοιγμα στο Board</a>` : ''}
    </div>
  `;

  try {
    await sendEmail({
      to: recipients,
      subject: `Υπενθύμιση: ${task.title}`,
      html,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Αποτυχία αποστολής email.' };
  }

  return { ok: true, sent: recipients.length };
}
