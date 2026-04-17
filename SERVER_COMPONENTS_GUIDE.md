# Server-Side Components & Data Fetching Guide

This guide explains how to use Next.js 16.2.4 server-side components for data fetching in A-Sisyphus.

## Architecture Overview

A-Sisyphus uses a **server-first architecture**:

```
┌─────────────────────────────────────────┐
│         Server Components               │
│  (Direct Database Access)               │
│                                         │
│  - Fetch data from Prisma               │
│  - Query Bunny CDN                      │
│  - Handle authentication                │
│  - Process business logic               │
└────────────────────┬────────────────────┘
                     │ Props
                     ↓
┌─────────────────────────────────────────┐
│    Client Components                    │
│  (UI & Interactivity)                   │
│                                         │
│  - Display data                         │
│  - Handle user input                    │
│  - Call server actions                  │
│  - Manage local state                   │
└─────────────────────────────────────────┘
```

## Guidelines

### ✅ DO: Server Components (Default)

Use server components for:
- Fetching data from the database
- Accessing environment variables
- Handling authentication/authorization
- Processing sensitive business logic
- Accessing backend services

```typescript
// ✅ Good: Server Component
export default async function ProjectPage({ params }) {
  const project = await getProject(params.id);
  
  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div>
      <h1>{project.name}</h1>
      <ProjectStats project={project} />
      <TaskList tasks={project.tasks} />
    </div>
  );
}
```

### ❌ DON'T: Client-Side Data Fetching

Avoid fetching data on the client:

```typescript
// ❌ Bad: Fetching on client
'use client'

export default function ProjectPage() {
  const [project, setProject] = useState(null);

  useEffect(() => {
    // ❌ Don't do this!
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(setProject);
  }, [id]);

  return <div>{project?.name}</div>;
}
```

## Server Component Examples

### 1. Simple Data Fetch

```typescript
// app/(app)/projects/page.tsx
import { getWorkspaceProjects } from '@/lib/db';

export default async function ProjectsPage() {
  const projects = await getWorkspaceProjects('workspace-123');

  return (
    <div className="grid grid-cols-3 gap-4">
      {projects.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

### 2. Dynamic Data with Parameters

```typescript
// app/(app)/projects/[id]/page.tsx
import { getProject } from '@/lib/db';
import { notFound } from 'next/navigation';

export default async function ProjectDetailPage({ params }) {
  const project = await getProject(params.id);

  if (!project) {
    notFound();
  }

  return (
    <div>
      <ProjectHeader project={project} />
      <ProjectTasks tasks={project.tasks} />
    </div>
  );
}
```

### 3. Multiple Data Sources

```typescript
// app/(app)/dashboard/page.tsx
import { getDashboardStats, getUserWorkspaces } from '@/lib/db';

export default async function DashboardPage() {
  const [stats, workspaces] = await Promise.all([
    getDashboardStats(),
    getUserWorkspaces(),
  ]);

  return (
    <div>
      <StatsCards stats={stats} />
      <WorkspaceList workspaces={workspaces} />
    </div>
  );
}
```

### 4. With Authorization

```typescript
// app/(app)/admin/page.tsx
import { getCurrentUser } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (user?.role !== 'admin') {
    redirect('/dashboard');
  }

  return <AdminPanel />;
}
```

## Server Actions

Server actions are functions that run on the server and can be called from client components.

### Creating a Server Action

```typescript
// lib/actions.ts
'use server'

import { prisma } from './prisma';
import { getCurrentUser } from './db';

export async function updateProject(
  projectId: string,
  data: { name: string; description: string }
) {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data,
  });

  revalidatePath(`/projects/${projectId}`);
  return project;
}

export async function deleteTask(taskId: string) {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  await prisma.task.delete({
    where: { id: taskId },
  });

  revalidatePath('/board');
}
```

### Calling Server Actions from Client Components

```typescript
// components/project-form.tsx
'use client'

import { updateProject } from '@/lib/actions';
import { useState } from 'react';

export function ProjectForm({ project }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData) {
    setIsLoading(true);
    try {
      await updateProject(project.id, {
        name: formData.get('name'),
        description: formData.get('description'),
      });
    } catch (error) {
      console.error('Failed to update:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form action={handleSubmit}>
      <input name="name" defaultValue={project.name} />
      <textarea name="description" defaultValue={project.description} />
      <button disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

## Composition: Server + Client Components

The recommended pattern:

```typescript
// ✅ Server Component (fetches data)
export default async function ProjectPage({ params }) {
  const project = await getProject(params.id);
  const tasks = await getProjectTasks(params.id);

  return (
    <div>
      <ProjectHeader project={project} />
      
      {/* Pass data to client component */}
      <TaskBoard tasks={tasks} projectId={project.id} />
    </div>
  );
}
```

```typescript
// ✅ Client Component (handles UI state)
'use client'

import { updateTask } from '@/lib/actions';

export function TaskBoard({ tasks, projectId }) {
  const [items, setItems] = useState(tasks);
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleDragEnd(result) {
    setIsUpdating(true);
    try {
      await updateTask(result.taskId, { status: result.newStatus });
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div onDragEnd={handleDragEnd}>
      {/* UI logic here */}
    </div>
  );
}
```

## Data Fetching Patterns

### Pattern 1: Direct Database Query

```typescript
// ✅ Server Component
import { prisma } from '@/lib/prisma';

export default async function Page() {
  const data = await prisma.project.findMany({
    where: { ownerId: userId },
  });

  return <DataDisplay data={data} />;
}
```

### Pattern 2: Using Database Utilities

```typescript
// ✅ Server Component
import { getWorkspaceProjects } from '@/lib/db';

export default async function Page() {
  const projects = await getWorkspaceProjects(workspaceId);
  return <ProjectGrid projects={projects} />;
}
```

### Pattern 3: CDN Data Fetch

```typescript
// ✅ Server Component
import { getProjectExportsFromCDN } from '@/lib/pms-storage';

export default async function Page({ projectId }) {
  const exports = await getProjectExportsFromCDN(projectId);
  return <ExportList exports={exports} />;
}
```

### Pattern 4: Multiple Sources

```typescript
// ✅ Server Component
import { getProject, getProjectExportsFromCDN } from '@/lib/db';

export default async function Page({ projectId }) {
  // Fetch all data in parallel
  const [project, exports] = await Promise.all([
    getProject(projectId),
    getProjectExportsFromCDN(projectId),
  ]);

  return (
    <>
      <ProjectInfo project={project} />
      <ExportHistory exports={exports} />
    </>
  );
}
```

## Error Handling

### Server Component Error Handling

```typescript
import { notFound } from 'next/navigation';

export default async function Page({ params }) {
  try {
    const data = await getProject(params.id);
    
    if (!data) {
      notFound();
    }

    return <ProjectView data={data} />;
  } catch (error) {
    console.error('Failed to load project:', error);
    throw error; // Will trigger error.tsx
  }
}
```

### Server Action Error Handling

```typescript
'use server'

export async function saveProject(data: any) {
  try {
    const result = await prisma.project.create({ data });
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return { success: false, error: 'Project name already exists' };
      }
    }
    throw error;
  }
}
```

## Revalidation

Invalidate cache after mutations:

```typescript
'use server'

import { revalidatePath } from 'next/cache';

export async function updateTask(taskId: string, data: any) {
  await prisma.task.update({
    where: { id: taskId },
    data,
  });

  // Revalidate affected pages
  revalidatePath('/board');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/dashboard');
}
```

## Performance Tips

### 1. Use Parallel Fetching

```typescript
// ✅ Good: Parallel
const [projects, tasks, team] = await Promise.all([
  getProjects(),
  getTasks(),
  getTeam(),
]);
```

```typescript
// ❌ Bad: Sequential
const projects = await getProjects();
const tasks = await getTasks();
const team = await getTeam();
```

### 2. Fetch Only What You Need

```typescript
// ✅ Good: Select specific fields
const projects = await prisma.project.findMany({
  select: {
    id: true,
    name: true,
    status: true,
  },
});
```

```typescript
// ❌ Bad: Fetch everything
const projects = await prisma.project.findMany();
```

### 3. Use Pagination for Large Datasets

```typescript
// ✅ Good: Paginated
const tasks = await prisma.task.findMany({
  where: { projectId },
  take: 20,
  skip: (page - 1) * 20,
});
```

### 4. Cache Strategic Data

```typescript
// ✅ Good: Cache with revalidation
import { unstable_cache } from 'next/cache';

const getCachedUser = unstable_cache(
  async (id) => prisma.user.findUnique({ where: { id } }),
  ['user'],
  { revalidate: 3600, tags: ['user'] }
);
```

## Structure Overview

```
app/
├── (app)/                    # Protected routes
│   ├── dashboard/
│   │   └── page.tsx          # Server component (fetches stats)
│   ├── projects/
│   │   ├── page.tsx          # Server component (fetches projects)
│   │   └── [id]/
│   │       └── page.tsx      # Server component (fetches project details)
│   └── board/
│       └── page.tsx          # Server component (fetches tasks)
│
├── api/
│   └── auth/
│       └── route.ts          # Auth.js handlers
│
└── layout.tsx                # Server component (session check)

lib/
├── db.ts                     # Database queries (server functions)
├── actions.ts                # Server actions
├── pms-storage.ts            # CDN operations
└── bunnycdn.ts               # CDN utilities

components/
├── project-form.tsx          # Client component (form state)
├── task-card.tsx             # Client component (interactions)
└── language-switcher.tsx     # Client component
```

## Best Practices Summary

✅ **DO:**
- Use server components by default
- Fetch data at component level
- Use server actions for mutations
- Leverage async/await
- Parallel fetch when possible
- Use revalidatePath after mutations
- Select only needed fields
- Handle errors properly
- Cache expensive queries

❌ **DON'T:**
- Fetch on the client
- Expose API keys to client
- Make N+1 queries
- Block on sequential requests
- Skip authentication checks
- Ignore error cases
- Leave sensitive data in props
- Use eval() or similar
- Trust client-provided IDs blindly

## Resources

- [Next.js Server Components](https://nextjs.org/docs/getting-started/react-essentials#server-components)
- [Server Actions](https://nextjs.org/docs/guides/server-actions)
- [Data Fetching Patterns](https://nextjs.org/docs/app/building-your-application/data-fetching)
- [Revalidation](https://nextjs.org/docs/app/building-your-application/data-fetching/fetching-caching-and-revalidating)
- [Prisma Documentation](https://www.prisma.io/docs)
