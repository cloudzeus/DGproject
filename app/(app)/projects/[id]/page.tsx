import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ProjectDetail } from './project-detail';
import { MembersManager } from './members-manager';
import { ProjectActionsBar } from './project-actions-bar';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, project, allUsers] = await Promise.all([
    auth(),
    prisma.project.findUnique({
      where: { id },
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            assignees: { include: { user: true } },
            attachments: {
              select: { id: true, name: true, size: true, mimeType: true, url: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!project) notFound();

  const role = session?.user?.role;
  const canEdit =
    role === 'admin' || role === 'manager' || session?.user?.id === project.ownerId;

  const projectMemberOptions = project.members.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? '',
    email: m.user.email,
  }));

  const normalized = {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    status: project.status,
    dueDate: project.dueDate,
    members: project.members.map((m) => ({
      name: m.user.name ?? m.user.email,
      avatarUrl: m.user.image ?? undefined,
    })),
    tasks: project.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      startDate: t.startDate,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      completedAt: t.completedAt,
      assignees: t.assignees.map((a) => ({
        id: a.user.id,
        name: a.user.name ?? a.user.email,
        avatarUrl: a.user.image ?? undefined,
      })),
      attachments: t.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
        url: a.url,
        createdAt: a.createdAt,
      })),
    })),
  };

  const memberUsers = project.members.map((m) => ({
    id: m.user.id,
    name: m.user.name ?? '',
    email: m.user.email,
    image: m.user.image,
    role: m.user.role,
  }));

  const userOptions = allUsers.map((u) => ({ id: u.id, name: u.name ?? '', email: u.email }));

  return (
    <>
      <ProjectDetail project={normalized} projectMembers={projectMemberOptions} canEdit={canEdit} />
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-4">
        <div className="flex items-center justify-end">
          <ProjectActionsBar
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              color: project.color,
              status: project.status,
              dueDate: project.dueDate,
              ownerId: project.ownerId,
              memberIds: project.members.map((m) => m.userId),
            }}
            users={userOptions}
            canEdit={canEdit}
          />
        </div>
        <MembersManager
          projectId={project.id}
          canEdit={canEdit}
          ownerId={project.ownerId}
          members={memberUsers}
          allUsers={allUsers.map((u) => ({
            id: u.id,
            name: u.name ?? '',
            email: u.email,
            image: u.image,
            role: u.role,
          }))}
        />
      </div>
    </>
  );
}
