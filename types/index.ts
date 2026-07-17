// These types are designed to map directly to Prisma models.
// When migrating to Prisma, each interface becomes a model with minor adjustments:
//  - Date fields become DateTime
//  - Nested arrays become relations
//  - IDs become @id @default(cuid())
//  - Enums become Prisma enums

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'admin' | 'manager' | 'member' | 'viewer';
  azureAdId?: string; // for O365 integration later
  createdAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: Date;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  color: string;
  icon: string;
  startDate?: Date;
  dueDate?: Date;
  progress: number; // 0-100
  ownerId: string;
  memberIds: string[];
  sharepointSiteUrl?: string; // O365 integration
  teamsChannelId?: string;    // O365 integration
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assigneeIds: string[];
  dueDate?: Date;
  startDate?: Date;
  estimatedHours?: number;
  completedAt?: Date;
  parentTaskId?: string;
  tags: string[];
  order: number; // for drag-drop ordering within a column
  attachmentIds: string[];
  outlookEventId?: string; // O365 calendar sync
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  mentionedUserIds: string[];
  createdAt: Date;
}

export interface Attachment {
  id: string;
  taskId?: string;
  projectId?: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  source: 'local' | 'onedrive' | 'sharepoint';
  sharepointFileId?: string; // O365 file reference
  uploadedById: string;
  createdAt: Date;
}

export interface Activity {
  id: string;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  actorId: string;
  action: 'created' | 'updated' | 'completed' | 'commented' | 'assigned' | 'moved';
  targetType: 'task' | 'project' | 'comment';
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'mention' | 'assignment' | 'due_soon' | 'comment' | 'status_change';
  read: boolean;
  link?: string;
  createdAt: Date;
}

// UI-specific view models (not persisted, computed from base types)
export interface TaskWithRelations extends Task {
  assignees: User[];
  project: Pick<Project, 'id' | 'name' | 'color'>;
  commentCount: number;
  attachmentCount: number;
  // Set when the task was created from a support ticket (Ticket.taskId).
  ticket?: { id: string; code: string } | null;
}

export interface ProjectWithStats extends Project {
  owner: User;
  taskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
}
