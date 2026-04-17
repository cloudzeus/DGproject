'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

async function requireTaskEditor(taskId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role === 'admin' || role === 'manager') return { userId: session.user.id, projectId: null as string | null };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, project: { select: { ownerId: true } } },
  });
  if (!task) throw new Error('Task not found');
  if (task.project.ownerId === session.user.id) return { userId: session.user.id, projectId: task.projectId };
  const isMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: task.projectId, userId: session.user.id } },
  });
  if (!isMember) throw new Error('Forbidden');
  return { userId: session.user.id, projectId: task.projectId };
}

export async function rescheduleTask(taskId: string, startDate: Date | null, dueDate: Date | null) {
  const { projectId } = await requireTaskEditor(taskId);
  await prisma.task.update({
    where: { id: taskId },
    data: { startDate, dueDate },
  });
  revalidatePath('/timeline');
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function reassignTask(taskId: string, userId: string | null) {
  const { projectId } = await requireTaskEditor(taskId);
  await prisma.taskAssignee.deleteMany({ where: { taskId } });
  if (userId) {
    await prisma.taskAssignee.create({ data: { taskId, userId } });
  }
  revalidatePath('/timeline');
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
