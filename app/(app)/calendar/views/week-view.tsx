'use client';

import { cn } from '@/lib/utils';
import {
  addDays,
  eventsOnDay,
  formatTime,
  layoutTimedEvents,
  sameDay,
  startOfWeek,
  tasksOnDay,
  type CalendarEvent,
  type CalendarTask,
} from './shared';

const HOUR_HEIGHT = 52;
const TOTAL_HOURS = 24;

interface Props {
  anchorDate: Date;
  tasks: CalendarTask[];
  events: CalendarEvent[];
  onCellClick: (d: Date) => void;
  canCreate: boolean;
  singleDay?: boolean;
}

export function WeekView({ anchorDate, tasks, events, onCellClick, canCreate, singleDay }: Props) {
  const today = new Date();
  const startDay = singleDay ? new Date(anchorDate) : startOfWeek(anchorDate);
  startDay.setHours(0, 0, 0, 0);
  const dayCount = singleDay ? 1 : 7;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(startDay, i));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with day names */}
      <div
        className="grid border-b border-black/5"
        style={{ gridTemplateColumns: `56px repeat(${dayCount}, 1fr)` }}
      >
        <div className="border-r border-black/5" />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="px-3 py-2 border-r border-black/5 text-center"
            >
              <div className="text-[11px] uppercase tracking-wider text-fluent-neutral-60">
                {d.toLocaleDateString('el-GR', { weekday: 'short' })}
              </div>
              <div
                className={cn(
                  'inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-semibold mt-1',
                  isToday ? 'bg-fluent-blue-500 text-white' : 'text-fluent-neutral-90',
                )}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div
        className="grid border-b border-black/5 bg-fluent-neutral-4/50"
        style={{ gridTemplateColumns: `56px repeat(${dayCount}, 1fr)` }}
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-fluent-neutral-50 text-right border-r border-black/5">
          ολοήμερα
        </div>
        {days.map((d) => {
          const tasksHere = tasksOnDay(tasks, d);
          const allDayEvents = eventsOnDay(events, d).filter((e) => e.isAllDay);
          return (
            <div
              key={d.toISOString()}
              onClick={() => onCellClick(d)}
              className={cn(
                'px-1.5 py-1.5 border-r border-black/5 space-y-1 min-h-[32px]',
                canCreate && 'cursor-pointer hover:bg-fluent-neutral-4',
              )}
            >
              {tasksHere.map((t) => (
                <div
                  key={`t-${t.id}`}
                  className="text-[11px] px-1.5 py-0.5 rounded truncate font-medium text-white"
                  style={{ background: t.projectColor }}
                  title={`${t.projectName} · ${t.title}`}
                >
                  {t.title}
                </div>
              ))}
              {allDayEvents.map((e) => (
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
            </div>
          );
        })}
      </div>

      {/* Hour grid */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `56px repeat(${dayCount}, 1fr)`,
            height: `${TOTAL_HOURS * HOUR_HEIGHT}px`,
          }}
        >
          {/* Hour labels column */}
          <div className="relative border-r border-black/5">
            {Array.from({ length: TOTAL_HOURS }, (_, h) => (
              <div
                key={h}
                className="text-[10px] text-fluent-neutral-50 pr-2 text-right relative"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="absolute -top-1.5 right-2">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const positioned = layoutTimedEvents(events, d);
            const isToday = sameDay(d, today);
            return (
              <div
                key={d.toISOString()}
                className="relative border-r border-black/5"
                onClick={(ev) => {
                  if (!canCreate) return;
                  const rect = ev.currentTarget.getBoundingClientRect();
                  const y = ev.clientY - rect.top;
                  const hour = Math.floor(y / HOUR_HEIGHT);
                  const clickDate = new Date(d);
                  clickDate.setHours(Math.max(0, Math.min(23, hour)), 0, 0, 0);
                  onCellClick(clickDate);
                }}
                style={{
                  backgroundImage:
                    'linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)',
                  backgroundSize: `100% ${HOUR_HEIGHT}px`,
                  cursor: canCreate ? 'pointer' : 'default',
                }}
              >
                {isToday && <NowIndicator />}
                {positioned.map(({ event, topPct, heightPct, lane, totalLanes }) => {
                  const widthPct = 100 / totalLanes;
                  const leftPct = widthPct * lane;
                  const startDate = new Date(event.start);
                  const endDate = new Date(event.end);
                  return (
                    <a
                      key={event.id}
                      href={event.webLink ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="absolute rounded-md bg-fluent-blue-100 border-l-2 border-fluent-blue-500 text-fluent-blue-800 px-1.5 py-1 text-[11px] font-medium overflow-hidden hover:bg-fluent-blue-200 transition-colors"
                      style={{
                        top: `${topPct}%`,
                        height: `max(${heightPct}%, 20px)`,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                      title={`${event.subject}${event.location ? ` · ${event.location}` : ''}`}
                    >
                      <div className="font-semibold truncate">{event.subject}</div>
                      <div className="text-[10px] opacity-70">
                        {formatTime(startDate)} – {formatTime(endDate)}
                      </div>
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowIndicator() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const topPx = (minutes / 60) * HOUR_HEIGHT;
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-10"
      style={{ top: topPx }}
    >
      <div className="h-0.5 bg-fluent-accent-red" />
      <div className="h-2 w-2 rounded-full bg-fluent-accent-red -mt-1 -ml-1" />
    </div>
  );
}
