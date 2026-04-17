'use server';

import { prisma } from './prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

/**
 * Get current user session (server-side)
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      azureAdId: true,
      createdAt: true,
    },
  });

  return user;
}

/**
 * Get user's workspaces (server-side)
 */
export async function getUserWorkspaces() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  return await prisma.workspace.findMany({
    where: {
      ownerId: user.id,
    },
    include: {
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Get workspace by ID with authorization check (server-side)
 */
export async function getWorkspace(workspaceId: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      ownerId: user.id,
    },
    include: {
      projects: true,
      activities: {
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!workspace) {
    throw new Error('Workspace not found or unauthorized');
  }

  return workspace;
}

/**
 * Get all projects in workspace (server-side)
 */
export async function getWorkspaceProjects(
  workspaceId: string,
  filters?: { status?: string }
) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const where: any = {
    workspaceId,
    workspace: {
      ownerId: user.id,
    },
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  return await prisma.project.findMany({
    where,
    include: {
      tasks: {
        select: {
          id: true,
          status: true,
          priority: true,
        },
      },
      members: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
}

/**
 * Get project by ID (server-side)
 */
export async function getProject(projectId: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: {
        ownerId: user.id,
      },
    },
    include: {
      tasks: {
        orderBy: {
          order: 'asc',
        },
      },
      attachments: true,
      members: true,
    },
  });

  if (!project) {
    throw new Error('Project not found or unauthorized');
  }

  return project;
}

/**
 * Get tasks for project (server-side)
 */
export async function getProjectTasks(
  projectId: string,
  filters?: { status?: string; priority?: string }
) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const where: any = {
    projectId,
    project: {
      workspace: {
        ownerId: user.id,
      },
    },
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  return await prisma.task.findMany({
    where,
    include: {
      comments: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
      attachments: true,
      tags: true,
    },
    orderBy: {
      order: 'asc',
    },
  });
}

/**
 * Get kanban board data (server-side)
 */
export async function getKanbanBoardData(projectId: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: {
        ownerId: user.id,
      },
    },
  });

  if (!project) {
    throw new Error('Project not found or unauthorized');
  }

  const tasksByStatus = await prisma.task.groupBy({
    by: ['status'],
    where: {
      projectId,
    },
    _count: {
      id: true,
    },
  });

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
    },
    include: {
      comments: true,
      attachments: true,
      tags: true,
    },
    orderBy: {
      order: 'asc',
    },
  });

  return {
    project,
    tasks,
    stats: tasksByStatus,
  };
}

/**
 * Get dashboard stats (server-side)
 */
export async function getDashboardStats() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const projects = await prisma.project.count({
    where: {
      workspace: {
        ownerId: user.id,
      },
    },
  });

  const tasks = await prisma.task.count({
    where: {
      project: {
        workspace: {
          ownerId: user.id,
        },
      },
    },
  });

  const completedTasks = await prisma.task.count({
    where: {
      status: 'done',
      project: {
        workspace: {
          ownerId: user.id,
        },
      },
    },
  });

  const activeProjects = await prisma.project.count({
    where: {
      status: 'active',
      workspace: {
        ownerId: user.id,
      },
    },
  });

  return {
    projects,
    tasks,
    completedTasks,
    activeProjects,
    completionRate: tasks > 0 ? Math.round((completedTasks / tasks) * 100) : 0,
  };
}

/**
 * Revalidate dashboard cache
 */
export async function revalidateDashboard() {
  revalidatePath('/dashboard');
}

/**
 * Revalidate projects cache
 */
export async function revalidateProjects() {
  revalidatePath('/projects');
  revalidatePath('/projects/[id]');
}
