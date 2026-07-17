import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/signin?callbackUrl=/dashboard');
  }

  // Force users with a temporary password into the change-password flow before they
  // can access any other app surface. The /auth/change-password route lives outside
  // the (app) group so this redirect doesn't loop.
  if (session.user.mustChangePassword) {
    redirect('/auth/change-password');
  }

  // Privileged users see all projects in the sidebar; members + viewers (clients) only
  // see projects they own or are members of.
  const role = session.user.role;
  const userId = session.user.id;
  const isPrivileged = role === 'admin' || role === 'manager';

  const [user, sidebarProjects, pendingQuestions, pendingTickets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, image: true, role: true, userType: true, azureAdId: true },
    }),
    prisma.project.findMany({
      where: {
        status: { not: 'archived' },
        ...(isPrivileged
          ? {}
          : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] }),
      },
      select: { id: true, name: true, color: true },
      orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
      take: 8,
    }),
    prisma.taskQuestion.count({
      where: { askedToId: userId, answer: null },
    }),
    isPrivileged
      ? prisma.ticket.count({ where: { status: { in: ['new', 'analyzing', 'triaged'] } } })
      : Promise.resolve(0),
  ]);

  if (!user) {
    redirect('/auth/signin');
  }

  return (
    <AppShell
      userRole={user.role}
      userType={user.userType}
      projects={sidebarProjects}
      user={{
        name: user.name ?? user.email,
        email: user.email,
        image: user.image,
        microsoftConnected: Boolean(user.azureAdId),
      }}
      badges={{ questions: pendingQuestions, tickets: pendingTickets }}
    >
      {children}
    </AppShell>
  );
}
