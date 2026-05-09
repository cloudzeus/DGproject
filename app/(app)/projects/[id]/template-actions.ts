'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export type TaskTemplateOption = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  estimatedHours: number | null;
  addToCalendar: boolean;
  addToTeams: boolean;
  tags: string | null;
  createdById: string;
  createdByName: string;
  isMine: boolean;
};

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user;
}

/**
 * Templates are workspace-global: anyone authenticated can pick from any saved
 * template. Only the creator (or admin) can edit/delete. We rely on the UI to
 * gate destructive actions; server actions enforce ownership again on delete.
 */
export async function listTaskTemplates(): Promise<TaskTemplateOption[]> {
  const user = await requireUser();
  const rows = await prisma.taskTemplate.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskPriority,
    estimatedHours: t.estimatedHours,
    addToCalendar: t.addToCalendar,
    addToTeams: t.addToTeams,
    tags: t.tags,
    createdById: t.createdById,
    createdByName: t.createdBy.name ?? t.createdBy.email,
    isMine: t.createdById === user.id,
  }));
}

export async function saveTaskTemplate(formData: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  const user = await requireUser();
  if (user.role === 'viewer') return { ok: false, error: 'Δεν επιτρέπεται.' };

  const name = String(formData.get('name') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const priorityRaw = String(formData.get('priority') ?? 'medium') as TaskPriority;
  const priority: TaskPriority = PRIORITIES.includes(priorityRaw) ? priorityRaw : 'medium';
  const hoursRaw = String(formData.get('estimatedHours') ?? '').trim();
  const estimatedHours = hoursRaw ? Number.parseFloat(hoursRaw) : null;
  const addToCalendar = String(formData.get('addToCalendar') ?? '') === 'on';
  const addToTeams = String(formData.get('addToTeams') ?? '') === 'on';
  const tags = String(formData.get('tags') ?? '').trim() || null;

  if (name.length < 2) return { ok: false, error: 'Δώσε ένα όνομα στο πρότυπο.' };
  if (title.length < 2) return { ok: false, error: 'Ο τίτλος εργασίας είναι πολύ σύντομος.' };
  if (estimatedHours !== null && (Number.isNaN(estimatedHours) || estimatedHours < 0)) {
    return { ok: false, error: 'Μη έγκυρες ώρες.' };
  }

  const created = await prisma.taskTemplate.create({
    data: {
      name,
      title,
      description,
      priority,
      estimatedHours: estimatedHours ?? undefined,
      addToCalendar,
      addToTeams,
      tags,
      createdById: user.id,
    },
    select: { id: true },
  });

  revalidatePath('/', 'layout');
  return { ok: true, id: created.id };
}

export async function deleteTaskTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (user.role === 'viewer') return { ok: false, error: 'Δεν επιτρέπεται.' };

  const tpl = await prisma.taskTemplate.findUnique({
    where: { id },
    select: { createdById: true },
  });
  if (!tpl) return { ok: false, error: 'Το πρότυπο δεν βρέθηκε.' };
  if (tpl.createdById !== user.id && user.role !== 'admin') {
    return { ok: false, error: 'Μόνο ο δημιουργός ή διαχειριστής μπορεί να διαγράψει το πρότυπο.' };
  }

  await prisma.taskTemplate.delete({ where: { id } });
  revalidatePath('/', 'layout');
  return { ok: true };
}
