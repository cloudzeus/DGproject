'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
};

export async function fetchMyNotifications(): Promise<{
  items: NotificationRow[];
  unread: number;
}> {
  const session = await auth();
  if (!session?.user?.id) return { items: [], unread: 0 };

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
  ]);

  return {
    items: rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: n.read,
      link: n.link,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  };
}

export async function markNotificationRead(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
