'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  eventsOnDay,
  tasksOnDay,
  type CalendarEvent,
  type CalendarTask,
} from './shared';

interface Props {
  year: number;
  month: number;
  tasks: CalendarTask[];
  events: CalendarEvent[];
  onCellClick: (d: Date) => void;
  canCreate: boolean;
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = startDay - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), inMonth: false });
  }
  const last = new Date(year, month + 1, 0);
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (days.length < 42) {
    const next = new Date(days[days.length - 1].date);
    next.setDate(next.getDate() + 1);
    days.push({ date: next, inMonth: false });
  }
  return days;
}

export function MonthView({ year, month, tasks, events, onCellClick, canCreate }: Props) {
  const days = getMonthDays(year, month);
  const today = new Date();

  return (
    <>
      <div className="grid grid-cols-7 border-b border-black/5">
        {(['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'] as const).map((d, idx) => (
          <div
            key={d}
            className={cn(
              'px-3 py-2 text-xs font-semibold uppercase tracking-wider',
              idx === 0 && 'text-rose-700 bg-rose-50',
              idx === 6 && 'text-amber-700 bg-amber-50',
              idx !== 0 && idx !== 6 && 'text-fluent-neutral-60',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const isToday = d.date.toDateString() === today.toDateString();
          const dow = d.date.getDay();
          const isSat = dow === 6;
          const isSun = dow === 0;
          const tasksHere = tasksOnDay(tasks, d.date);
          const eventsHere = eventsOnDay(events, d.date);
          const total = tasksHere.length + eventsHere.length;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: i * 0.003 }}
              onClick={() => onCellClick(d.date)}
              className={cn(
                'border-r border-b border-black/5 p-2 min-h-0 flex flex-col transition-colors',
                canCreate && 'cursor-pointer',
                d.inMonth && isSat && 'bg-amber-50/60 hover:bg-amber-50',
                d.inMonth && isSun && 'bg-rose-50/60 hover:bg-rose-50',
                d.inMonth && !isSat && !isSun && 'hover:bg-fluent-neutral-4',
                !d.inMonth && 'bg-fluent-neutral-4/50',
                !d.inMonth && isSat && 'bg-amber-50/30',
                !d.inMonth && isSun && 'bg-rose-50/30',
              )}
            >
              <div
                className={cn(
                  'text-xs font-semibold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full shrink-0',
                  isToday && 'bg-fluent-blue-500 text-white',
                  !isToday && d.inMonth && isSat && 'text-amber-800',
                  !isToday && d.inMonth && isSun && 'text-rose-800',
                  !isToday && d.inMonth && !isSat && !isSun && 'text-fluent-neutral-80',
                  !isToday && !d.inMonth && 'text-fluent-neutral-40',
                )}
              >
                {d.date.getDate()}
              </div>
              <div className="flex-1 space-y-1 overflow-hidden">
                {tasksHere.slice(0, 2).map((t) => (
                  <div
                    key={`t-${t.id}`}
                    className="text-[11px] px-1.5 py-0.5 rounded truncate font-medium text-white"
                    style={{ background: t.projectColor }}
                    title={`${t.projectName} · ${t.title}`}
                  >
                    {t.title}
                  </div>
                ))}
                {eventsHere.slice(0, Math.max(0, 3 - Math.min(tasksHere.length, 2))).map((e) => (
                  <a
                    key={`e-${e.id}`}
                    href={e.webLink ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    className="block text-[11px] px-1.5 py-0.5 rounded truncate font-medium text-fluent-blue-700 bg-fluent-blue-50 border border-fluent-blue-200 hover:bg-fluent-blue-100"
                    title={`Outlook · ${e.subject}${e.location ? ` · ${e.location}` : ''}`}
                  >
                    📧 {e.subject}
                  </a>
                ))}
                {total > 3 && (
                  <div className="text-[11px] text-fluent-neutral-60 px-1.5">
                    +{total - 3} ακόμη
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
