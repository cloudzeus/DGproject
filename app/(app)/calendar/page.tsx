import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { graphIsConfigured, listUserCalendarEvents } from '@/lib/microsoft-graph';
import { CalendarClient } from './calendar-client';
import type { CalendarTask, CalendarEvent, CalendarView } from './views/shared';

function parseView(v: string | undefined): CalendarView {
  if (v === 'month' || v === 'week' || v === 'day' || v === 'agenda') return v;
  return 'month';
}

function parseMonth(m: string | undefined): Date | null {
  if (!m || !/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split('-').map(Number);
  if (!y || mo < 1 || mo > 12) return null;
  return new Date(y, mo - 1, 1);
}

function parseDate(d: string | undefined): Date | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, mo, day] = d.split('-').map(Number);
  if (!y || !mo || !day) return null;
  return new Date(y, mo - 1, day);
}

function resolveRange(
  view: CalendarView,
  anchor: Date,
): { start: Date; end: Date; anchorDate: Date } {
  if (view === 'week') {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end, anchorDate: anchor };
  }
  if (view === 'day') {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, anchorDate: start };
  }
  if (view === 'agenda') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return { start, end, anchorDate: start };
  }
  // month (42-cell grid)
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startOffset = first.getDay();
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 42);
  return { start, end, anchorDate: first };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; m?: string; d?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const params = await searchParams;

  const view = parseView(params.view);
  const dateAnchor = parseDate(params.d);
  const monthAnchor = parseMonth(params.m);
  const anchor = dateAnchor ?? monthAnchor ?? new Date();
  const { start, end, anchorDate } = resolveRange(view, anchor);
  const monthForUrl =
    view === 'month' || view === 'agenda'
      ? monthAnchor ?? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      : new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, azureAdId: true },
  });

  const tasksRaw = await prisma.task.findMany({
    where: {
      assignees: { some: { userId } },
      dueDate: { gte: start, lt: end },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      project: { select: { name: true, color: true } },
    },
  });

  const tasks: CalendarTask[] = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    projectColor: t.project.color,
    projectName: t.project.name,
    dueDate: t.dueDate!.toISOString(),
  }));

  const m365Configured = graphIsConfigured();
  const hasMicrosoftAccount = Boolean(user?.azureAdId);
  const canCreate = m365Configured && hasMicrosoftAccount;

  let events: CalendarEvent[] = [];
  let outlookError: string | null = null;

  if (canCreate) {
    try {
      const graphEvents = await listUserCalendarEvents(
        user!.azureAdId!,
        start.toISOString(),
        end.toISOString(),
      );
      events = graphEvents.map((e) => ({
        id: e.id,
        subject: e.subject,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        isAllDay: e.isAllDay,
        location: e.location,
        webLink: e.webLink,
      }));
    } catch (e) {
      outlookError = e instanceof Error ? e.message : 'Unknown error';
    }
  }

  return (
    <CalendarClient
      view={view}
      year={monthForUrl.getFullYear()}
      month={monthForUrl.getMonth()}
      anchorDateISO={anchorDate.toISOString()}
      tasks={tasks}
      events={events}
      outlookError={outlookError}
      canCreate={canCreate}
      m365Configured={m365Configured}
    />
  );
}
