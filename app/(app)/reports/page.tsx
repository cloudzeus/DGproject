import { auth } from '@/auth';
import { resolveRange, rangeLabel } from '@/lib/reports/shared';
import { buildOverviewReport } from '@/lib/reports/overview';
import { buildProjectsReport } from '@/lib/reports/projects';
import { buildTasksReport } from '@/lib/reports/tasks';
import { buildTicketsReport } from '@/lib/reports/tickets';
import { buildUsersReport } from '@/lib/reports/users';
import { ReportsShell, type ReportTab } from './reports-shell';
import { OverviewTab } from './overview-tab';
import { ProjectsTab } from './projects-tab';
import { TasksTab } from './tasks-tab';
import { TicketsTab } from './tickets-tab';
import { UsersTab } from './users-tab';

export const dynamic = 'force-dynamic';

const VALID_TABS: ReportTab[] = ['overview', 'projects', 'tasks', 'tickets', 'users'];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const isPrivileged = session?.user?.role === 'admin' || session?.user?.role === 'manager';

  let tab: ReportTab = VALID_TABS.includes(sp.tab as ReportTab) ? (sp.tab as ReportTab) : 'overview';
  if (!isPrivileged && (tab === 'tickets' || tab === 'users')) tab = 'overview';

  const { range, prev, preset } = resolveRange(sp);
  const scope = { range, prev, userId, isPrivileged };

  // Φορτώνουμε ΜΟΝΟ το ενεργό tab — αλλαγή tab/περιόδου είναι navigation.
  let content: React.ReactNode;
  switch (tab) {
    case 'overview': {
      const data = await buildOverviewReport(scope);
      content = <OverviewTab data={data} />;
      break;
    }
    case 'projects': {
      const data = await buildProjectsReport(scope);
      content = <ProjectsTab data={data} />;
      break;
    }
    case 'tasks': {
      const data = await buildTasksReport(scope);
      content = <TasksTab data={data} />;
      break;
    }
    case 'tickets': {
      const data = await buildTicketsReport(scope);
      content = <TicketsTab data={data} />;
      break;
    }
    case 'users': {
      const data = await buildUsersReport(scope);
      content = <UsersTab data={data} />;
      break;
    }
    default: {
      const data = await buildOverviewReport(scope);
      content = <OverviewTab data={data} />;
    }
  }

  return (
    <ReportsShell
      tab={tab}
      preset={preset}
      periodLabel={rangeLabel(range)}
      prevLabel={rangeLabel(prev)}
      isPrivileged={isPrivileged}
    >
      {content}
    </ReportsShell>
  );
}
