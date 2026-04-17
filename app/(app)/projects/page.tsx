import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ProjectsGrid } from './projects-grid';

export default async function ProjectsPage() {
  const [session, projects, users] = await Promise.all([
    auth(),
    prisma.project.findMany({
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const role = session?.user?.role;
  const currentUserId = session?.user?.id ?? '';
  const canCreate = role === 'admin' || role === 'manager';

  const normalized = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    status: p.status,
    dueDate: p.dueDate,
    ownerId: p.ownerId,
    memberIds: p.members.map((m) => m.userId),
    tasks: p.tasks,
    members: p.members.map((m) => ({
      name: m.user.name ?? m.user.email,
      avatarUrl: m.user.image ?? undefined,
    })),
    canEdit: role === 'admin' || role === 'manager' || p.ownerId === currentUserId,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <ProjectsGrid
        projects={normalized}
        users={users.map((u) => ({ id: u.id, name: u.name ?? '', email: u.email }))}
        currentUserId={currentUserId}
        canCreate={canCreate}
      />
    </div>
  );
}
