import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/signin?callbackUrl=/dashboard');
  }

  const [user, sidebarProjects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, image: true, role: true },
    }),
    prisma.project.findMany({
      where: { status: { not: 'archived' } },
      select: { id: true, name: true, color: true },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
  ]);

  if (!user) {
    redirect('/auth/signin');
  }

  return (
    <div className="flex min-h-screen bg-mesh">
      <Sidebar userRole={user.role} projects={sidebarProjects} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          user={{
            name: user.name ?? user.email,
            email: user.email,
            image: user.image,
          }}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
