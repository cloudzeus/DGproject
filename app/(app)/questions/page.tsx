import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { QuestionsClient, type QuestionListItem } from './questions-client';

export const dynamic = 'force-dynamic';

export default async function QuestionsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }
  const userId = session.user.id;

  const rawQuestions = await prisma.taskQuestion.findMany({
    where: {
      OR: [{ askedById: userId }, { askedToId: userId }],
    },
    orderBy: [{ answeredAt: 'asc' }, { createdAt: 'desc' }],
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

  const role = session.user.role;
  const isPrivileged = role === 'admin' || role === 'manager';

  return (
    <QuestionsClient
      currentUserId={userId}
      isPrivileged={isPrivileged}
      questions={items}
    />
  );
}
