'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft20Regular, ChevronRight20Regular, Add16Filled,
  CalendarSync20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { mockTasks, mockProjects } from '@/lib/mock-data';
import { cn, formatDate } from '@/lib/utils';

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const startDay = first.getDay(); // 0 = Sunday
  const days: Array<{ date: Date; inMonth: boolean }> = [];

  // Pad from previous month
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, inMonth: false });
  }
  // Current month
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }
  // Pad next month to complete 6 rows (42 cells)
  while (days.length < 42) {
    const next = new Date(days[days.length - 1].date);
    next.setDate(next.getDate() + 1);
    days.push({ date: next, inMonth: false });
  }
  return days;
}

export default function CalendarPage() {
  const [current, setCurrent] = useState(() => new Date());
  const days = getMonthDays(current.getFullYear(), current.getMonth());
  const today = new Date();

  const goPrev = () => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  const goNext = () => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  const goToday = () => setCurrent(new Date());

  function tasksOnDay(d: Date) {
    return mockTasks.filter(t => {
      if (!t.dueDate) return false;
      return t.dueDate.toDateString() === d.toDateString();
    });
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto h-[calc(100vh-56px)] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Calendar</h1>
          <p className="text-fluent-neutral-60 mt-1">Task deadlines synced with Outlook</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" icon={<CalendarSync20Regular />}>
            Sync with Outlook
          </Button>
          <Button variant="primary" size="md" icon={<Add16Filled />}>
            New event
          </Button>
        </div>
      </div>

      {/* Calendar container */}
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold">
              {current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-0.5 ml-2">
              <button onClick={goPrev} className="h-8 w-8 rounded-md hover:bg-fluent-neutral-6 flex items-center justify-center text-fluent-neutral-70">
                <ChevronLeft20Regular />
              </button>
              <button onClick={goNext} className="h-8 w-8 rounded-md hover:bg-fluent-neutral-6 flex items-center justify-center text-fluent-neutral-70">
                <ChevronRight20Regular />
              </button>
            </div>
            <Button variant="subtle" size="sm" onClick={goToday}>Today</Button>
          </div>
          <div className="flex gap-1 p-1 bg-fluent-neutral-6 rounded-lg">
            {['Month', 'Week', 'Day', 'Agenda'].map(v => (
              <button
                key={v}
                className={cn(
                  'px-3 h-7 rounded-md text-sm font-medium',
                  v === 'Month' ? 'bg-white shadow-fluent-2 text-fluent-neutral-90' : 'text-fluent-neutral-60',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-black/5">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 grid grid-cols-7 grid-rows-6">
          {days.map((d, i) => {
            const isToday = d.date.toDateString() === today.toDateString();
            const tasksHere = tasksOnDay(d.date);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: i * 0.005 }}
                className={cn(
                  'border-r border-b border-black/5 p-2 min-h-0 flex flex-col hover:bg-fluent-neutral-4 transition-colors cursor-pointer',
                  !d.inMonth && 'bg-fluent-neutral-4/50',
                )}
              >
                <div className={cn(
                  'text-xs font-semibold mb-1.5 w-6 h-6 flex items-center justify-center rounded-full shrink-0',
                  isToday && 'bg-fluent-blue-500 text-white',
                  !isToday && d.inMonth && 'text-fluent-neutral-80',
                  !isToday && !d.inMonth && 'text-fluent-neutral-40',
                )}>
                  {d.date.getDate()}
                </div>
                <div className="flex-1 space-y-1 overflow-hidden">
                  {tasksHere.slice(0, 3).map(t => {
                    const project = mockProjects.find(p => p.id === t.projectId)!;
                    return (
                      <div
                        key={t.id}
                        className="text-[11px] px-1.5 py-0.5 rounded truncate font-medium text-white"
                        style={{ background: project.color }}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                    );
                  })}
                  {tasksHere.length > 3 && (
                    <div className="text-[11px] text-fluent-neutral-60 px-1.5">+{tasksHere.length - 3} more</div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
