import type {
  User, Workspace, Project, Task, Comment, Activity, Notification,
  TaskWithRelations, ProjectWithStats,
} from '@/types';

// ─── USERS ─────────────────────────────────────────────────────────────
export const mockUsers: User[] = [
  { id: 'u1', name: 'Sarah Chen', email: 'sarah.chen@contoso.com', avatarUrl: 'https://i.pravatar.cc/150?img=47', role: 'admin', createdAt: new Date('2024-01-15') },
  { id: 'u2', name: 'Marcus Johnson', email: 'marcus.j@contoso.com', avatarUrl: 'https://i.pravatar.cc/150?img=12', role: 'manager', createdAt: new Date('2024-02-03') },
  { id: 'u3', name: 'Aisha Patel', email: 'aisha.p@contoso.com', avatarUrl: 'https://i.pravatar.cc/150?img=45', role: 'member', createdAt: new Date('2024-02-20') },
  { id: 'u4', name: 'Diego Ramirez', email: 'diego.r@contoso.com', avatarUrl: 'https://i.pravatar.cc/150?img=33', role: 'member', createdAt: new Date('2024-03-05') },
  { id: 'u5', name: 'Emma Wright', email: 'emma.w@contoso.com', avatarUrl: 'https://i.pravatar.cc/150?img=49', role: 'member', createdAt: new Date('2024-03-18') },
  { id: 'u6', name: 'Kenji Tanaka', email: 'kenji.t@contoso.com', avatarUrl: 'https://i.pravatar.cc/150?img=60', role: 'member', createdAt: new Date('2024-04-01') },
];

export const currentUser = mockUsers[0];

// ─── WORKSPACES ────────────────────────────────────────────────────────
export const mockWorkspaces: Workspace[] = [
  { id: 'w1', name: 'Contoso Product', description: 'Product team workspace', ownerId: 'u1', createdAt: new Date('2024-01-15') },
];

// ─── PROJECTS ──────────────────────────────────────────────────────────
export const mockProjects: Project[] = [
  {
    id: 'p1', workspaceId: 'w1', name: 'Q2 Product Launch',
    description: 'Coordinate the launch of our new analytics dashboard for Q2 2026.',
    status: 'active', color: '#0078D4', icon: 'Rocket',
    startDate: new Date('2026-03-01'), dueDate: new Date('2026-06-30'),
    progress: 64, ownerId: 'u1', memberIds: ['u1','u2','u3','u4'],
    sharepointSiteUrl: 'https://contoso.sharepoint.com/sites/q2launch',
    teamsChannelId: 'teams-ch-001',
    createdAt: new Date('2026-02-15'), updatedAt: new Date('2026-04-10'),
  },
  {
    id: 'p2', workspaceId: 'w1', name: 'Website Redesign',
    description: 'Complete overhaul of marketing website with Fluent design system.',
    status: 'active', color: '#8764B8', icon: 'Paint',
    startDate: new Date('2026-02-01'), dueDate: new Date('2026-05-15'),
    progress: 42, ownerId: 'u2', memberIds: ['u2','u3','u5'],
    createdAt: new Date('2026-01-20'), updatedAt: new Date('2026-04-08'),
  },
  {
    id: 'p3', workspaceId: 'w1', name: 'Mobile App v3',
    description: 'Native iOS and Android app with offline sync.',
    status: 'active', color: '#107C10', icon: 'Phone',
    startDate: new Date('2026-01-10'), dueDate: new Date('2026-08-01'),
    progress: 28, ownerId: 'u2', memberIds: ['u2','u4','u6'],
    createdAt: new Date('2026-01-05'), updatedAt: new Date('2026-04-12'),
  },
  {
    id: 'p4', workspaceId: 'w1', name: 'Customer Research 2026',
    description: 'User interviews and survey analysis for product-market fit.',
    status: 'planning', color: '#D83B01', icon: 'People',
    startDate: new Date('2026-04-15'), dueDate: new Date('2026-07-01'),
    progress: 12, ownerId: 'u3', memberIds: ['u1','u3','u5'],
    createdAt: new Date('2026-03-25'), updatedAt: new Date('2026-04-15'),
  },
  {
    id: 'p5', workspaceId: 'w1', name: 'Infrastructure Migration',
    description: 'Move services to new Azure regions with zero downtime.',
    status: 'on_hold', color: '#C239B3', icon: 'Cloud',
    startDate: new Date('2026-01-15'), dueDate: new Date('2026-06-01'),
    progress: 55, ownerId: 'u4', memberIds: ['u4','u6'],
    createdAt: new Date('2026-01-10'), updatedAt: new Date('2026-03-30'),
  },
  {
    id: 'p6', workspaceId: 'w1', name: 'Brand Guidelines v2',
    description: 'Refreshed brand identity and asset library.',
    status: 'completed', color: '#498205', icon: 'Star',
    startDate: new Date('2025-11-01'), dueDate: new Date('2026-02-28'),
    progress: 100, ownerId: 'u5', memberIds: ['u2','u5'],
    createdAt: new Date('2025-10-20'), updatedAt: new Date('2026-02-28'),
  },
];

// ─── TASKS ─────────────────────────────────────────────────────────────
const now = new Date();
const addDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

export const mockTasks: Task[] = [
  // Project 1 — Q2 Product Launch
  { id: 't1', projectId: 'p1', title: 'Finalize launch campaign copy', description: 'Work with marketing to lock down all messaging for the launch email sequence and landing page.', status: 'in_progress', priority: 'high', assigneeIds: ['u3'], dueDate: addDays(3), tags: ['marketing','copy'], order: 0, attachmentIds: [], createdAt: addDays(-10), updatedAt: addDays(-1), createdById: 'u1' },
  { id: 't2', projectId: 'p1', title: 'Design hero section animations', description: 'Create subtle scroll-triggered animations for the hero.', status: 'in_progress', priority: 'medium', assigneeIds: ['u5'], dueDate: addDays(5), tags: ['design','animation'], order: 1, attachmentIds: [], createdAt: addDays(-8), updatedAt: addDays(-2), createdById: 'u2' },
  { id: 't3', projectId: 'p1', title: 'Set up analytics tracking', status: 'todo', priority: 'high', assigneeIds: ['u4'], dueDate: addDays(7), tags: ['engineering','analytics'], order: 0, attachmentIds: [], createdAt: addDays(-5), updatedAt: addDays(-5), createdById: 'u1' },
  { id: 't4', projectId: 'p1', title: 'Draft press release', status: 'todo', priority: 'medium', assigneeIds: ['u1'], dueDate: addDays(10), tags: ['marketing','pr'], order: 1, attachmentIds: [], createdAt: addDays(-4), updatedAt: addDays(-4), createdById: 'u1' },
  { id: 't5', projectId: 'p1', title: 'Record demo video', status: 'todo', priority: 'low', assigneeIds: ['u2','u5'], dueDate: addDays(14), tags: ['video','demo'], order: 2, attachmentIds: [], createdAt: addDays(-3), updatedAt: addDays(-3), createdById: 'u2' },
  { id: 't6', projectId: 'p1', title: 'Beta tester feedback review', status: 'review', priority: 'high', assigneeIds: ['u3','u1'], dueDate: addDays(2), tags: ['research'], order: 0, attachmentIds: [], createdAt: addDays(-12), updatedAt: addDays(-1), createdById: 'u3' },
  { id: 't7', projectId: 'p1', title: 'Pricing page A/B test setup', status: 'backlog', priority: 'medium', assigneeIds: ['u4'], tags: ['experiment'], order: 0, attachmentIds: [], createdAt: addDays(-6), updatedAt: addDays(-6), createdById: 'u1' },
  { id: 't8', projectId: 'p1', title: 'Competitor analysis deck', status: 'done', priority: 'medium', assigneeIds: ['u3'], completedAt: addDays(-2), tags: ['research'], order: 0, attachmentIds: [], createdAt: addDays(-15), updatedAt: addDays(-2), createdById: 'u1' },
  { id: 't9', projectId: 'p1', title: 'Kickoff meeting notes', status: 'done', priority: 'low', assigneeIds: ['u1'], completedAt: addDays(-20), tags: ['meeting'], order: 1, attachmentIds: [], createdAt: addDays(-22), updatedAt: addDays(-20), createdById: 'u1' },
  { id: 't10', projectId: 'p1', title: 'Stakeholder alignment doc', status: 'done', priority: 'high', assigneeIds: ['u1','u2'], completedAt: addDays(-18), tags: ['planning'], order: 2, attachmentIds: [], createdAt: addDays(-25), updatedAt: addDays(-18), createdById: 'u1' },

  // Project 2 — Website Redesign
  { id: 't11', projectId: 'p2', title: 'Design system component audit', status: 'in_progress', priority: 'high', assigneeIds: ['u5'], dueDate: addDays(4), tags: ['design','audit'], order: 0, attachmentIds: [], createdAt: addDays(-7), updatedAt: addDays(-1), createdById: 'u2' },
  { id: 't12', projectId: 'p2', title: 'Migrate blog to new CMS', status: 'todo', priority: 'medium', assigneeIds: ['u3'], dueDate: addDays(12), tags: ['engineering'], order: 0, attachmentIds: [], createdAt: addDays(-5), updatedAt: addDays(-5), createdById: 'u2' },
  { id: 't13', projectId: 'p2', title: 'SEO meta improvements', status: 'backlog', priority: 'low', assigneeIds: ['u3'], tags: ['seo'], order: 0, attachmentIds: [], createdAt: addDays(-4), updatedAt: addDays(-4), createdById: 'u2' },
];

// ─── COMMENTS ──────────────────────────────────────────────────────────
export const mockComments: Comment[] = [
  { id: 'c1', taskId: 't1', authorId: 'u2', content: 'Love the direction here. Can we emphasize the ROI angle more?', mentionedUserIds: [], createdAt: addDays(-2) },
  { id: 'c2', taskId: 't1', authorId: 'u3', content: '@Marcus Johnson agreed, drafting v2 now.', mentionedUserIds: ['u2'], createdAt: addDays(-1) },
  { id: 'c3', taskId: 't6', authorId: 'u1', content: 'Top 3 themes from feedback: onboarding friction, pricing clarity, mobile polish.', mentionedUserIds: [], createdAt: addDays(-1) },
];

// ─── ACTIVITIES ────────────────────────────────────────────────────────
export const mockActivities: Activity[] = [
  { id: 'a1', workspaceId: 'w1', projectId: 'p1', taskId: 't1', actorId: 'u3', action: 'updated', targetType: 'task', createdAt: addDays(-1) },
  { id: 'a2', workspaceId: 'w1', projectId: 'p1', taskId: 't2', actorId: 'u5', action: 'moved', targetType: 'task', metadata: { from: 'todo', to: 'in_progress' }, createdAt: addDays(-2) },
  { id: 'a3', workspaceId: 'w1', projectId: 'p1', taskId: 't8', actorId: 'u3', action: 'completed', targetType: 'task', createdAt: addDays(-2) },
  { id: 'a4', workspaceId: 'w1', projectId: 'p2', taskId: 't11', actorId: 'u5', action: 'assigned', targetType: 'task', createdAt: addDays(-3) },
  { id: 'a5', workspaceId: 'w1', projectId: 'p1', taskId: 't1', actorId: 'u2', action: 'commented', targetType: 'comment', createdAt: addDays(-2) },
];

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────
export const mockNotifications: Notification[] = [
  { id: 'n1', userId: 'u1', title: 'Task due soon', message: '"Beta tester feedback review" is due in 2 days', type: 'due_soon', read: false, link: '/board?task=t6', createdAt: addDays(-0.1) },
  { id: 'n2', userId: 'u1', title: 'New comment', message: 'Marcus commented on "Finalize launch campaign copy"', type: 'comment', read: false, link: '/board?task=t1', createdAt: addDays(-0.3) },
  { id: 'n3', userId: 'u1', title: 'Mentioned you', message: 'Aisha mentioned you in a comment', type: 'mention', read: true, link: '/board?task=t1', createdAt: addDays(-1) },
];

// ─── HELPERS: build view models ────────────────────────────────────────
export function getTaskWithRelations(task: Task): TaskWithRelations {
  const project = mockProjects.find(p => p.id === task.projectId)!;
  return {
    ...task,
    assignees: mockUsers.filter(u => task.assigneeIds.includes(u.id)),
    project: { id: project.id, name: project.name, color: project.color },
    commentCount: mockComments.filter(c => c.taskId === task.id).length,
    attachmentCount: task.attachmentIds.length,
  };
}

export function getProjectWithStats(project: Project): ProjectWithStats {
  const tasks = mockTasks.filter(t => t.projectId === project.id);
  return {
    ...project,
    owner: mockUsers.find(u => u.id === project.ownerId)!,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter(t => t.status === 'done').length,
    overdueTaskCount: tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'done').length,
  };
}

export function getTasksByProject(projectId: string): TaskWithRelations[] {
  return mockTasks.filter(t => t.projectId === projectId).map(getTaskWithRelations);
}

export function getAllProjectsWithStats(): ProjectWithStats[] {
  return mockProjects.map(getProjectWithStats);
}
