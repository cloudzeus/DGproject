'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

async function requireProjectEditor(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role === 'admin' || role === 'manager') return session.user.id;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error('Project not found');
  if (project.ownerId !== session.user.id) throw new Error('Forbidden');
  return session.user.id;
}

export async function addProjectMember(projectId: string, userId: string) {
  await requireProjectEditor(projectId);

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (existing) return { ok: false, error: 'Ο χρήστης είναι ήδη μέλος.' };

  await prisma.projectMember.create({
    data: { projectId, userId },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string) {
  await requireProjectEditor(projectId);

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}
