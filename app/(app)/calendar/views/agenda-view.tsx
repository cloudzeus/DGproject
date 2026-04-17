'use client';

import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import {
  formatTime,
  sameDay,
  toISODate,
  type CalendarEvent,
  type CalendarTask,
} from './shared';

interface Props {
  tasks: CalendarTask[];
  events: CalendarEvent[];
  onCreate: () => void;
  canCreate: boolean;
}

type Item =
  | { kind: 'task'; date: Date; task: CalendarTask }
  | { kind: 'event'; date: Date; event: CalendarEvent };

export function AgendaView({ tasks, events, onCreate, canCreate }: Props) {
  const items: Item[] = [
    ...tasks.map<Item>((t) => ({ kind: 'task', date: new Date(t.dueDate), task: t })),
    ...events.map<Item>((e) => ({ kind: 'event', date: new Date(e.start), event: e })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const grouped: Array<{ day: Date; items: Item[] }> = [];
  for (const it of items) {
    const last = grouped[grouped.length - 1];
    if (last && sameDay(last.day, it.date)) {
      last.items.push(it);
    } else {
      grouped.push({ day: it.date, items: [it] });
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
        <div className="text-sm text-fluent-neutral-60">Κανένα event ή task σε αυτό το διάστημα.</div>
        {canCreate && (
          <button
            onClick={onCreate}
            className="text-sm text-fluent-blue-600 font-medium hover:underline"
          >
            Δημιουργία event
          </button>
        )}
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
        {grouped.map((g) => {
          const isToday = sameDay(g.day, today);
          return (
            <Fragment key={toISODate(g.day)}>
              <div className="flex items-baseline gap-3 border-b border-black/5 pb-2">
                <div
                  className={cn(
                    'text-lg font-display font-semibold',
                    isToday ? 'text-fluent-blue-600' : 'text-fluent-neutral-90',
                  )}
                >
                  {g.day.toLocaleDateString('el-GR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </div>
                {isToday && (
                  <span className="text-xs font-semibold text-fluent-blue-600 uppercase tracking-wider">
                    σήμερα
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {g.items.map((it, idx) =>
                  it.kind === 'task' ? (
                    <div
                      key={`t-${it.task.id}-${idx}`}
                      className="flex items-center gap-3 p-3 bg-white border border-black/5 rounded-lg"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: it.task.projectColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-fluent-neutral-60">
                          {it.task.projectName}
                        </div>
                        <div className="text-sm font-medium text-fluent-neutral-90 truncate">
                          {it.task.title}
                        </div>
                      </div>
                      <span className="text-xs text-fluent-neutral-60 shrink-0">Task</span>
                    </div>
                  ) : (
                    <a
                      key={`e-${it.event.id}-${idx}`}
                      href={it.event.webLink ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-white border border-black/5 rounded-lg hover:border-fluent-blue-300 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-md bg-fluent-blue-50 text-fluent-blue-600 flex items-center justify-center shrink-0 font-semibold">
                        📧
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-fluent-neutral-90 truncate">
                          {it.event.subject}
                        </div>
                        <div className="text-xs text-fluent-neutral-60 mt-0.5">
                          {it.event.isAllDay
                            ? 'Ολοήμερο'
                            : `${formatTime(new Date(it.event.start))} – ${formatTime(new Date(it.event.end))}`}
                          {it.event.location ? ` · ${it.event.location}` : ''}
                        </div>
                      </div>
                      <span className="text-xs text-fluent-neutral-60 shrink-0">Outlook</span>
                    </a>
                  ),
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
