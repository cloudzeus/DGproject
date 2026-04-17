import { prisma } from './prisma';

export async function ensureDefaultWorkspace(userId: string): Promise<string> {
  const existing = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.workspace.create({
    data: { name: 'Default Workspace', ownerId: userId },
    select: { id: true },
  });
  return created.id;
}
