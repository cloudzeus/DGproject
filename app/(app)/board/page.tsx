import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { TaskWithRelations } from '@/types';
import { BoardClient } from './board-client';
import type { BoardProjectOption } from './board-task-modal';

export default async function BoardPage() {
  const session = await auth();
  const role = session?.user?.role;
  const userId = session?.user?.id ?? '';
  const isPrivileged = role === 'admin' || role === 'manager';

  const taskWhere = isPrivileged
    ? {}
    : {
        project: {
          OR: [{ ownerId: userId }, { members: { some: { userId } } }],
        },
      };

  const projectWhere = isPrivileged
    ? {}
    : {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      };

  const [tasks, headerUsers, editableProjects] = await Promise.all([
    prisma.task.findMany({
      where: taskWhere,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        tags: { select: { name: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    }),
    prisma.user.findMany({
      take: 8,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true },
    }),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
  ]);

  const normalized: TaskWithRelations[] = tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description ?? undefined,
    status: t.status,
    priority: t.priority,
    assigneeIds: t.assignees.map((a) => a.userId),
    dueDate: t.dueDate ?? undefined,
    startDate: t.startDate ?? undefined,
    estimatedHours: t.estimatedHours ?? undefined,
    completedAt: t.completedAt ?? undefined,
    parentTaskId: t.parentTaskId ?? undefined,
    tags: t.tags.map((tag) => tag.name),
    order: t.order,
    attachmentIds: [],
    outlookEventId: t.outlookEventId ?? undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdById: t.createdById,
    project: { id: t.project.id, name: t.project.name, color: t.project.color },
    assignees: t.assignees.map((a) => ({
      id: a.user.id,
      name: a.user.name ?? a.user.email,
      email: a.user.email,
      avatarUrl: a.user.image ?? undefined,
      role: 'member' as const,
      createdAt: new Date(),
    })),
    commentCount: t._count.comments,
    attachmentCount: t._count.attachments,
  }));

  const projects: BoardProjectOption[] = editableProjects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
    })),
  }));

  return (
    <BoardClient
      initialTasks={normalized}
      headerUsers={headerUsers.map((u) => ({
        id: u.id,
        name: u.name ?? u.email,
        avatarUrl: u.image ?? undefined,
      }))}
      projects={projects}
      canCreate={projects.length > 0}
    />
  );
}
