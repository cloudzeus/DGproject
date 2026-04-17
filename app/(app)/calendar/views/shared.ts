export type CalendarTask = {
  id: string;
  title: string;
  projectColor: string;
  projectName: string;
  dueDate: string;
};

export type CalendarEvent = {
  id: string;
  subject: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  webLink: string | null;
};

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function tasksOnDay(tasks: CalendarTask[], d: Date): CalendarTask[] {
  const key = toISODate(d);
  return tasks.filter((t) => t.dueDate.slice(0, 10) === key);
}

export function eventsOnDay(events: CalendarEvent[], d: Date): CalendarEvent[] {
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const ds = dayStart.getTime();
  const de = dayEnd.getTime();
  return events.filter((e) => {
    const s = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    return s < de && end > ds;
  });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
}

export type PositionedEvent = {
  event: CalendarEvent;
  topPct: number;
  heightPct: number;
  lane: number;
  totalLanes: number;
};

// Assigns overlapping events to lanes using first-fit algorithm.
export function layoutTimedEvents(events: CalendarEvent[], day: Date): PositionedEvent[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayMs = dayEnd.getTime() - dayStart.getTime();

  const timed = events
    .filter((e) => !e.isAllDay)
    .map((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const s = Math.max(start.getTime(), dayStart.getTime());
      const en = Math.min(end.getTime(), dayEnd.getTime());
      return { event, start: s, end: en };
    })
    .filter((e) => e.end > e.start)
    .sort((a, b) => a.start - b.start);

  const lanes: { start: number; end: number }[][] = [];
  const assignments: { idx: number; lane: number }[] = [];
  timed.forEach((t, idx) => {
    let placed = -1;
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const last = lane[lane.length - 1];
      if (last.end <= t.start) {
        lane.push(t);
        placed = i;
        break;
      }
    }
    if (placed === -1) {
      lanes.push([t]);
      placed = lanes.length - 1;
    }
    assignments.push({ idx, lane: placed });
  });

  // Find overlapping clusters to compute totalLanes per event
  // For simplicity, use max lanes overall as totalLanes.
  const totalLanes = Math.max(1, lanes.length);

  return timed.map((t, idx) => ({
    event: t.event,
    topPct: ((t.start - dayStart.getTime()) / dayMs) * 100,
    heightPct: ((t.end - t.start) / dayMs) * 100,
    lane: assignments[idx].lane,
    totalLanes,
  }));
}
