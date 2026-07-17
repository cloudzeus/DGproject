import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { buildAttention } from '@/lib/dashboard/attention';
import { buildMyDay } from '@/lib/dashboard/my-day';
import { DashboardShell } from './dashboard-shell';
import { AttentionZone } from './attention-zone';
import { MyDayZone } from './my-day-zone';
import type { QuickActionProject } from './quick-actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();

  // Auth (unauthenticated / must-change-password) is already enforced by
  // app/(app)/layout.tsx. Customers (userType='customer') have no dedicated
  // dashboard view yet (see spec Ζώνη scope) — they fall through to the same
  // member-scoped zones with mostly-empty attention/my-day lists, exactly as
  // the previous dashboard behaved for them.
  const userId = session?.user?.id ?? '';
  const displayName = session?.user?.name ?? session?.user?.email ?? 'εκεί';
  const firstName = displayName.split(' ')[0] ?? displayName;
  const isPrivileged = session?.user?.role === 'admin' || session?.user?.role === 'manager';

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Καλημέρα' : hour < 18 ? 'Καλησπέρα' : 'Καλησπέρα';
  const dateLabel = new Intl.DateTimeFormat('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  const scope = { userId, isPrivileged, now };

  const projectWhere = isPrivileged
    ? {}
    : { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };

  const [attention, myDay, editableProjects, allUsers] = await Promise.all([
    buildAttention(scope),
    buildMyDay(scope),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        projectCode: true,
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const quickActionProjects: QuickActionProject[] = editableProjects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    projectCode: p.projectCode,
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
    })),
  }));

  const users = allUsers.map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email }));

  return (
    <DashboardShell
      greeting={greeting}
      firstName={firstName}
      dateLabel={dateLabel}
      quickActionsProps={{
        projects: quickActionProjects,
        users,
        currentUserId: userId,
        canCreateProject: isPrivileged,
      }}
      main={
        <>
          <AttentionZone items={attention} />
          <MyDayZone data={myDay} />
        </>
      }
      aside={null}
    />
  );
}
