import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ProjectsGrid } from './projects-grid';

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/projects');

  const role = session.user.role;
  const currentUserId = session.user.id;
  const isPrivileged = role === 'admin' || role === 'manager';

  // Privileged users see all projects; everyone else (members + viewers/clients) only
  // sees projects where they are the owner or an explicit member.
  const projectWhere = isPrivileged
    ? {}
    : {
        OR: [{ ownerId: currentUserId }, { members: { some: { userId: currentUserId } } }],
      };

  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: { select: { id: true, status: true } },
      },
      orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
    }),
    // Viewers don't get a directory of every user (privacy + nothing they can do with it).
    isPrivileged
      ? prisma.user.findMany({
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as Array<{ id: string; name: string | null; email: string }>),
  ]);

  const canCreate = isPrivileged;

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
    canEdit: isPrivileged || p.ownerId === currentUserId,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <ProjectsGrid
        projects={normalized}
        users={users.map((u) => ({ id: u.id, name: u.name ?? '', email: u.email }))}
        currentUserId={currentUserId}
        canCreate={canCreate}
        canReorder={role !== 'viewer'}
      />
    </div>
  );
}
