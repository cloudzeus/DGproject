import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { TaskWithRelations } from '@/types';
import { BoardClient } from './board-client';
import type { BoardProjectOption } from './board-task-modal';

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const { task: focusTaskId } = await searchParams;
  const session = await auth();
  const role = session?.user?.role;
  const userId = session?.user?.id ?? '';
  const isPrivileged = role === 'admin' || role === 'manager';

  const taskWhere = {
    mergedIntoId: null,
    ...(isPrivileged
      ? {}
      : {
          project: {
            OR: [{ ownerId: userId }, { members: { some: { userId } } }],
          },
        }),
  };

  const projectWhere = isPrivileged
    ? {}
    : {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      };

  const [tasks, headerUsers, editableProjects, currentUser] = await Promise.all([
    prisma.task.findMany({
      where: taskWhere,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        project: { select: { id: true, name: true, color: true } },
        creator: { select: { id: true, name: true, email: true, image: true } },
        requesters: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        watchers: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        activities: {
          where: { action: 'completed' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            actor: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        tags: { select: { name: true } },
        ticket: { select: { id: true, code: true } },
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
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
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
    requesterIds: t.requesters.length > 0 ? t.requesters.map((r) => r.userId) : [t.createdById],
    watcherIds: t.watchers.map((w) => w.userId),
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
    requester: {
      id: (t.requesters[0]?.user ?? t.creator).id,
      name: (t.requesters[0]?.user ?? t.creator).name ?? (t.requesters[0]?.user ?? t.creator).email,
      email: (t.requesters[0]?.user ?? t.creator).email,
      avatarUrl: (t.requesters[0]?.user ?? t.creator).image ?? undefined,
      role: 'member' as const,
      createdAt: t.createdAt,
    },
    requesters: (t.requesters.length > 0 ? t.requesters.map((r) => r.user) : [t.creator]).map((user) => ({
      id: user.id,
      name: user.name ?? user.email,
      email: user.email,
      avatarUrl: user.image ?? undefined,
      role: 'member' as const,
      createdAt: t.createdAt,
    })),
    watchers: t.watchers.map((w) => ({
      id: w.user.id,
      name: w.user.name ?? w.user.email,
      email: w.user.email,
      avatarUrl: w.user.image ?? undefined,
      role: 'member' as const,
      createdAt: t.createdAt,
    })),
    assignees: t.assignees.map((a) => ({
      id: a.user.id,
      name: a.user.name ?? a.user.email,
      email: a.user.email,
      avatarUrl: a.user.image ?? undefined,
      role: 'member' as const,
      createdAt: new Date(),
    })),
    completedBy: t.activities[0] ? {
      id: t.activities[0].actor.id,
      name: t.activities[0].actor.name ?? t.activities[0].actor.email,
      email: t.activities[0].actor.email,
      avatarUrl: t.activities[0].actor.image ?? undefined,
      role: 'member' as const,
      createdAt: t.createdAt,
      completedAt: t.activities[0].createdAt,
    } : undefined,
    commentCount: t._count.comments,
    attachmentCount: t._count.attachments,
    ticket: t.ticket ? { id: t.ticket.id, code: t.ticket.code } : null,
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
      currentUser={currentUser ? {
        id: currentUser.id,
        name: currentUser.name ?? currentUser.email,
        email: currentUser.email,
      } : {
        id: userId,
        name: session?.user?.name ?? session?.user?.email ?? 'Εσύ',
        email: session?.user?.email ?? '',
      }}
      projects={projects}
      canCreate={projects.length > 0}
      focusTaskId={focusTaskId}
    />
  );
}
