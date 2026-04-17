import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { FilesClient, type FileRow } from './files-client';

export default async function FilesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const role = session?.user?.role;
  const isPrivileged = role === 'admin' || role === 'manager';

  const where = isPrivileged
    ? {}
    : {
        OR: [
          {
            project: {
              OR: [{ ownerId: userId }, { members: { some: { userId } } }],
            },
          },
          {
            task: {
              project: {
                OR: [{ ownerId: userId }, { members: { some: { userId } } }],
              },
            },
          },
          { uploadedById: userId },
        ],
      };

  const attachments = await prisma.attachment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true, image: true } },
      project: { select: { id: true, name: true, color: true } },
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  const files: FileRow[] = attachments.map((a) => {
    const projectInfo =
      a.project ?? a.task?.project ?? null;
    return {
      id: a.id,
      name: a.name,
      title: a.title,
      size: a.size,
      mimeType: a.mimeType,
      url: a.url,
      createdAt: a.createdAt.toISOString(),
      uploadedBy: {
        id: a.uploadedBy.id,
        name: a.uploadedBy.name ?? a.uploadedBy.email,
        avatarUrl: a.uploadedBy.image ?? undefined,
      },
      project: projectInfo
        ? { id: projectInfo.id, name: projectInfo.name, color: projectInfo.color }
        : null,
      task: a.task ? { id: a.task.id, title: a.task.title } : null,
    };
  });

  return <FilesClient files={files} />;
}
