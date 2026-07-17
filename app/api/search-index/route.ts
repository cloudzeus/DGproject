import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type SearchIndexItem = {
  type: 'project' | 'task' | 'ticket';
  id: string;
  label: string;
  href: string;
};

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Δεν είσαι συνδεδεμένος.' }, { status: 401 });
  }

  const isPrivileged = session.user.role === 'admin' || session.user.role === 'manager';

  const projectWhere = isPrivileged
    ? {}
    : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };

  const taskWhere = isPrivileged
    ? {}
    : { project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } };

  const [projects, tasks, tickets] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.task.findMany({
      where: taskWhere,
      take: 300,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true },
    }),
    isPrivileged
      ? prisma.ticket.findMany({
          take: 100,
          orderBy: { createdAt: 'desc' },
          select: { id: true, code: true, subject: true },
        })
      : Promise.resolve([]),
  ]);

  const items: SearchIndexItem[] = [
    ...projects.map((p) => ({
      type: 'project' as const,
      id: p.id,
      label: p.name,
      href: `/projects/${p.id}`,
    })),
    ...tasks.map((t) => ({
      type: 'task' as const,
      id: t.id,
      label: t.title,
      href: `/board?task=${t.id}`,
    })),
    ...tickets.map((t) => ({
      type: 'ticket' as const,
      id: t.id,
      label: `${t.code} · ${t.subject}`,
      href: `/tickets/${t.id}`,
    })),
  ];

  return NextResponse.json(
    { items },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );
}
