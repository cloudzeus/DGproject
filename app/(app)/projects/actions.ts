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
  // Viewers are read-only clients; they cannot create or modify projects.
  if (role === 'viewer') throw new Error('Forbidden: viewer role cannot edit');
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

  // SoftOne company combobox writes a hidden input "softoneCompanyId".
  // Empty string → clear linkage. Numeric string → set company id.
  const softoneCompanyRaw = String(formData.get('softoneCompanyId') ?? '').trim();
  const softoneCompany =
    softoneCompanyRaw === ''
      ? null
      : Number.isFinite(Number(softoneCompanyRaw))
      ? Number(softoneCompanyRaw)
      : undefined; // undefined → don't touch the field

  const data: {
    name: string;
    description: string | null;
    color: string;
    status: Status;
    dueDate: Date | null;
    ownerId?: string;
    softoneCompany?: number | null;
    // If the target company changed, the existing softone row no longer matches —
    // we drop sync status so admin re-syncs intentionally.
    softoneSyncStatus?: 'unsynced';
  } = {
    name: input.name,
    description: input.description,
    color: input.color,
    status: input.status,
    dueDate: input.dueDate,
  };

  if (softoneCompany !== undefined) {
    // Only mutate when the form explicitly provided a value.
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { softoneCompany: true },
    });
    if (existing && existing.softoneCompany !== softoneCompany) {
      data.softoneCompany = softoneCompany;
      data.softoneSyncStatus = 'unsynced';
    }
  }

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

export async function updateProjectStatus(id: string, status: Status) {
  await requireProjectEditor(id);
  if (!STATUSES.includes(status)) return { ok: false, error: 'Μη έγκυρη κατάσταση.' };
  await prisma.project.update({ where: { id }, data: { status } });
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * Reorders the supplied subset of project ids while preserving the relative
 * positions of every other project in the global list.
 *
 * The UI only ever drags within whatever the user currently sees (e.g. "active"
 * tab on dashboard, or filtered list on /projects). To keep that intuitive across
 * views, we walk the global order and, wherever the current id is one of the
 * visible/dragged ones, substitute the next id from the user's new ordering.
 * Non-visible projects keep their slots, so their relative position is unchanged.
 *
 * Auth: viewers (read-only clients) are rejected. Non-privileged users can only
 * include in `visibleIdsInNewOrder` projects they own or are members of.
 */
export async function reorderProjects(visibleIdsInNewOrder: string[]) {
  const { id, role } = await requireAuth();
  if (role === 'viewer') return { ok: false, error: 'Forbidden' };

  const visibleIds = Array.from(
    new Set(visibleIdsInNewOrder.filter((s) => typeof s === 'string' && s.length > 0)),
  );
  if (visibleIds.length === 0) return { ok: true };

  const isPrivileged = role === 'admin' || role === 'manager';

  if (!isPrivileged) {
    const allowed = await prisma.project.findMany({
      where: {
        id: { in: visibleIds },
        OR: [{ ownerId: id }, { members: { some: { userId: id } } }],
      },
      select: { id: true },
    });
    const allowedSet = new Set(allowed.map((p) => p.id));
    const unauthorized = visibleIds.filter((x) => !allowedSet.has(x));
    if (unauthorized.length > 0) return { ok: false, error: 'Forbidden' };
  }

  const all = await prisma.project.findMany({
    orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
    select: { id: true },
  });
  const allIds = all.map((p) => p.id);
  const visibleSet = new Set(visibleIds);

  // Sanity: every visibleId must exist globally (otherwise abort to avoid corrupting state).
  if (visibleIds.some((vid) => !allIds.includes(vid))) {
    return { ok: false, error: 'Project not found' };
  }

  // Walk allIds; whenever we hit a visible slot, drop in the next id from the new ordering.
  const queue = [...visibleIds];
  const merged = allIds.map((aid) => (visibleSet.has(aid) ? queue.shift()! : aid));

  await prisma.$transaction(
    merged.map((projectId, index) =>
      prisma.project.update({ where: { id: projectId }, data: { order: index } }),
    ),
  );

  revalidatePath('/projects');
  revalidatePath('/dashboard');
  revalidatePath('/', 'layout'); // sidebar list
  return { ok: true };
}
