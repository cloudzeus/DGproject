import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { ProjectMemberOption } from '@/app/(app)/projects/[id]/task-questions-panel';
import { QuestionsClient, type QuestionListItem } from './questions-client';

export const dynamic = 'force-dynamic';

export default async function QuestionsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }
  const userId = session.user.id;

  // Expand from "questions where I'm involved" → full threads (root + all
  // descendants of every root I touched). Uses MySQL 8 recursive CTE so we
  // can render the conversation in /questions even when intermediate follow-ups
  // don't list me as askedBy/askedTo directly.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE
      seed AS (
        SELECT id, parentId FROM TaskQuestion
        WHERE askedById = ${userId} OR askedToId = ${userId}
      ),
      ancestors (id, parentId) AS (
        SELECT id, parentId FROM seed
        UNION
        SELECT q.id, q.parentId FROM TaskQuestion q
          INNER JOIN ancestors a ON a.parentId = q.id
      ),
      roots AS (
        SELECT id FROM ancestors WHERE parentId IS NULL
      ),
      thread (id) AS (
        SELECT id FROM roots
        UNION
        SELECT q.id FROM TaskQuestion q INNER JOIN thread t ON q.parentId = t.id
      )
    SELECT id FROM thread
  `;
  const threadIds = rows.map((r) => r.id);

  const rawQuestions = threadIds.length === 0
    ? []
    : await prisma.taskQuestion.findMany({
        where: { id: { in: threadIds } },
        orderBy: [{ createdAt: 'asc' }],
        include: {
          askedBy: { select: { id: true, name: true, email: true, image: true } },
          askedTo: { select: { id: true, name: true, email: true, image: true } },
          attachments: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              kind: true,
              uploadedById: true,
              name: true,
              title: true,
              size: true,
              mimeType: true,
              url: true,
              createdAt: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueDate: true,
              project: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
      });

  const items: QuestionListItem[] = rawQuestions.map((q) => ({
    id: q.id,
    parentId: q.parentId,
    question: q.question,
    answer: q.answer,
    createdAt: q.createdAt,
    answeredAt: q.answeredAt,
    askedBy: {
      id: q.askedBy.id,
      name: q.askedBy.name ?? q.askedBy.email,
      email: q.askedBy.email,
      avatarUrl: q.askedBy.image ?? undefined,
    },
    askedTo: {
      id: q.askedTo.id,
      name: q.askedTo.name ?? q.askedTo.email,
      email: q.askedTo.email,
      avatarUrl: q.askedTo.image ?? undefined,
    },
    attachments: q.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      uploadedById: a.uploadedById,
      name: a.name,
      title: a.title,
      size: a.size,
      mimeType: a.mimeType,
      url: a.url,
    })),
    task: {
      id: q.task.id,
      title: q.task.title,
      status: q.task.status,
      priority: q.task.priority,
      dueDate: q.task.dueDate,
      project: {
        id: q.task.project.id,
        name: q.task.project.name,
        color: q.task.project.color,
      },
    },
  }));

  // Project members (owner + members) per project that appears in the list.
  // Needed by the follow-up composer to render recipient options.
  const projectIds = Array.from(new Set(items.map((it) => it.task.project.id)));
  const projects = projectIds.length === 0
    ? []
    : await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          owner: { select: { id: true, name: true, email: true, image: true } },
          members: {
            select: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      });

  const projectMembers: Record<string, ProjectMemberOption[]> = {};
  for (const p of projects) {
    const map = new Map<string, ProjectMemberOption>();
    map.set(p.owner.id, {
      id: p.owner.id,
      name: p.owner.name ?? p.owner.email,
      email: p.owner.email,
      avatarUrl: p.owner.image ?? undefined,
    });
    for (const m of p.members) {
      map.set(m.user.id, {
        id: m.user.id,
        name: m.user.name ?? m.user.email,
        email: m.user.email,
        avatarUrl: m.user.image ?? undefined,
      });
    }
    projectMembers[p.id] = Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'el'),
    );
  }

  const role = session.user.role;
  const isPrivileged = role === 'admin' || role === 'manager';

  return (
    <QuestionsClient
      currentUserId={userId}
      isPrivileged={isPrivileged}
      questions={items}
      projectMembers={projectMembers}
    />
  );
}
