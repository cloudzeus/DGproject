'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureDefaultWorkspace } from '@/lib/workspaces';

type Status = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
const STATUSES: Status[] = ['planning', 'active', 'on_hold', 'completed', 'archived'];

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return { id: session.user.id, role: session.user.role };
}

async function requireProjectEditor(projectId: string) {
  const { id, role } = await requireAuth();
  if (role === 'admin' || role === 'manager') return { id, role };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new Error('Project not found');
  if (project.ownerId !== id) throw new Error('Forbidden');
  return { id, role };
}

function parseFormData(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const color = String(formData.get('color') ?? '#0078D4').trim();
  const statusRaw = String(formData.get('status') ?? 'planning') as Status;
  const status: Status = STATUSES.includes(statusRaw) ? statusRaw : 'planning';
  const dueRaw = String(formData.get('dueDate') ?? '').trim();
  const dueDate = dueRaw ? new Date(dueRaw) : null;
  const ownerId = String(formData.get('ownerId') ?? '').trim();
  const memberIds = formData.getAll('memberIds').map((v) => String(v)).filter(Boolean);
  return { name, description, color, status, dueDate, ownerId, memberIds };
}

export async function createProject(formData: FormData) {
  const { id: actorId, role } = await requireAuth();
  if (role !== 'admin' && role !== 'manager') {
    return { ok: false, error: 'Δεν έχετε δικαίωμα δημιουργίας έργου.' };
  }

  const input = parseFormData(formData);
  if (input.name.length < 2) return { ok: false, error: 'Το όνομα είναι πολύ σύντομο.' };

  const ownerId = input.ownerId || actorId;
  const ownerExists = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!ownerExists) return { ok: false, error: 'Μη έγκυρος ιδιοκτήτης.' };

  const workspaceId = await ensureDefaultWorkspace(ownerId);
  const allMemberIds = Array.from(new Set([ownerId, ...input.memberIds]));

  const created = await prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      color: input.color,
      icon: input.name.slice(0, 1).toUpperCase(),
      status: input.status,
      dueDate: input.dueDate,
      ownerId,
      workspaceId,
      members: {
        create: allMemberIds.map((userId) => ({ userId })),
      },
    },
    select: { id: true },
  });

  revalidatePath('/projects');
  redirect(`/projects/${created.id}`);
}

export async function updateProject(id: string, formData: FormData) {
  await requireProjectEditor(id);
  const input = parseFormData(formData);
  if (input.name.length < 2) return { ok: false, error: 'Το όνομα είναι πολύ σύντομο.' };

  const data: {
    name: string;
    description: string | null;
    color: string;
    status: Status;
    dueDate: Date | null;
    ownerId?: string;
  } = {
    name: input.name,
    description: input.description,
    color: input.color,
    status: input.status,
    dueDate: input.dueDate,
  };

  if (input.ownerId) {
    const ownerExists = await prisma.user.findUnique({ where: { id: input.ownerId }, select: { id: true } });
    if (!ownerExists) return { ok: false, error: 'Μη έγκυρος ιδιοκτήτης.' };
    data.ownerId = input.ownerId;
    // Ensure new owner is a member too
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: input.ownerId } },
      create: { projectId: id, userId: input.ownerId },
      update: {},
    });
  }

  await prisma.project.update({ where: { id }, data });
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

export async function deleteProject(id: string) {
  await requireProjectEditor(id);
  await prisma.project.delete({ where: { id } });
  revalidatePath('/projects');
  redirect('/projects');
}
