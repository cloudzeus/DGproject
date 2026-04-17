'use server';

import { uploadFileToCDN, getCDNUrl, deleteFileFromCDN } from './bunnycdn';
import { prisma } from './prisma';

export interface PMSExportData {
  projectId: string;
  projectName: string;
  workspace: string;
  exportedAt: string;
  tasks: any[];
  stats: any;
}

/**
 * Export project data to Bunny CDN
 */
export async function exportProjectToCDN(projectId: string): Promise<string> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          include: {
            comments: true,
            attachments: true,
            tags: true,
          },
        },
        workspace: true,
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const exportData: PMSExportData = {
      projectId: project.id,
      projectName: project.name,
      workspace: project.workspace.name,
      exportedAt: new Date().toISOString(),
      tasks: project.tasks,
      stats: {
        totalTasks: project.tasks.length,
        completedTasks: project.tasks.filter((t) => t.status === 'done').length,
        progress: project.progress,
      },
    };

    const filename = `project-${project.id}-${Date.now()}.json`;
    const buffer = Buffer.from(JSON.stringify(exportData, null, 2));

    const result = await uploadFileToCDN({
      file: buffer,
      filename,
      folder: 'pms/projects',
      contentType: 'application/json',
    });

    // Save CDN link to database
    await prisma.attachment.create({
      data: {
        projectId,
        name: `Project Export - ${new Date().toLocaleDateString()}`,
        size: buffer.length,
        mimeType: 'application/json',
        url: result.url,
        source: 'local',
        uploadedById: project.ownerId,
      },
    });

    console.log('✅ Project exported to CDN:', result.url);
    return result.url;
  } catch (error) {
    console.error('❌ Failed to export project to CDN:', error);
    throw error;
  }
}

/**
 * Store task data to Bunny CDN
 */
export async function storeTaskToCDN(taskId: string): Promise<string> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        comments: {
          include: {
            author: true,
          },
        },
        attachments: true,
        tags: true,
      },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    const taskData = {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours,
      progress: task.order,
      comments: task.comments,
      attachments: task.attachments,
      tags: task.tags,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    const filename = `task-${task.id}-${Date.now()}.json`;
    const buffer = Buffer.from(JSON.stringify(taskData, null, 2));

    const result = await uploadFileToCDN({
      file: buffer,
      filename,
      folder: 'pms/tasks',
      contentType: 'application/json',
    });

    console.log('✅ Task stored to CDN:', result.url);
    return result.url;
  } catch (error) {
    console.error('❌ Failed to store task to CDN:', error);
    throw error;
  }
}

/**
 * Store multiple tasks/project data as CSV to CDN
 */
export async function exportProjectAsCSV(projectId: string): Promise<string> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          include: {
            comments: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Build CSV content
    const headers = [
      'Task ID',
      'Title',
      'Status',
      'Priority',
      'Due Date',
      'Estimated Hours',
      'Comments Count',
      'Created At',
      'Updated At',
    ];

    const rows = project.tasks.map((task) => [
      task.id,
      task.title,
      task.status,
      task.priority,
      task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '',
      task.estimatedHours || '',
      task.comments.length,
      new Date(task.createdAt).toLocaleString(),
      new Date(task.updatedAt).toLocaleString(),
    ]);

    const csv =
      [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n') + '\n';

    const filename = `project-${project.id}-export-${Date.now()}.csv`;
    const buffer = Buffer.from(csv);

    const result = await uploadFileToCDN({
      file: buffer,
      filename,
      folder: 'pms/exports',
      contentType: 'text/csv',
    });

    // Save export reference
    await prisma.attachment.create({
      data: {
        projectId,
        name: `Project CSV Export - ${new Date().toLocaleDateString()}`,
        size: buffer.length,
        mimeType: 'text/csv',
        url: result.url,
        source: 'local',
        uploadedById: project.ownerId,
      },
    });

    console.log('✅ Project exported as CSV to CDN:', result.url);
    return result.url;
  } catch (error) {
    console.error('❌ Failed to export project as CSV to CDN:', error);
    throw error;
  }
}

/**
 * Get all project backups/exports from CDN
 */
export async function getProjectExportsFromCDN(projectId: string) {
  try {
    const attachments = await prisma.attachment.findMany({
      where: {
        projectId,
        source: 'local',
        mimeType: {
          in: ['application/json', 'text/csv'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return attachments;
  } catch (error) {
    console.error('❌ Failed to get project exports:', error);
    throw error;
  }
}

/**
 * Delete project export from CDN
 */
export async function deleteProjectExportFromCDN(attachmentId: string): Promise<boolean> {
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Delete from CDN
    const filePath = attachment.url.split(process.env.BUNNY_CDN_HOSTNAME || '')[1];
    if (filePath) {
      await deleteFileFromCDN(filePath.substring(1)); // Remove leading slash
    }

    // Delete from database
    await prisma.attachment.delete({
      where: { id: attachmentId },
    });

    console.log('✅ Project export deleted from CDN');
    return true;
  } catch (error) {
    console.error('❌ Failed to delete project export:', error);
    throw error;
  }
}
