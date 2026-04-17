'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { addDays, differenceInCalendarDays, startOfDay, format, isSameMonth, isWeekend } from 'date-fns';
import { Avatar } from '@/components/ui/avatar';
import { BUSINESS_START_HOUR, BUSINESS_END_HOUR } from '@/lib/business-hours';

export type GanttAssignee = { id: string; name: string; avatarUrl?: string };

export type GanttTask = {
  id: string;
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  status: string;
  priority: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  assignees: GanttAssignee[];
};

export type GanttRow = {
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
  tasks: GanttTask[];
};

export type GanttZoom = 'day' | 'week' | 'month';

const ROW_HEIGHT = 52;
const LABEL_WIDTH = 220;
const DAY_WIDTH_BY_ZOOM: Record<GanttZoom, number> = {
  day: 520,
  week: 140,
  month: 44,
};
const HOURS_PER_WORKDAY = 8;

function startOfISOWeek(d: Date): Date {
  const r = startOfDay(d);
  const dow = r.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // back to Monday
  r.setDate(r.getDate() + diff);
  return r;
}

function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const cursor = startOfDay(new Date(start));
  const last = startOfDay(end);
  while (cursor <= last) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

type Props = {
  rows: GanttRow[];
  canEdit: boolean;
  zoom?: GanttZoom;
  anchorDate?: Date;
  onReschedule?: (taskId: string, startDate: Date, dueDate: Date) => void;
  onClickTask?: (task: GanttTask) => void;
  onReassign?: (task: GanttTask) => void;
};

function resolveDates(task: GanttTask): { start: Date; end: Date } | null {
  if (!task.startDate && !task.dueDate) return null;
  const hoursDays = Math.max(1, Math.ceil((task.estimatedHours ?? 8) / 8));
  const end = task.dueDate ? startOfDay(task.dueDate) : startOfDay(addDays(task.startDate!, hoursDays - 1));
  const start = task.startDate ? startOfDay(task.startDate) : startOfDay(addDays(end, -(hoursDays - 1)));
  if (end < start) return { start: end, end: start };
  return { start, end };
}

export function Gantt({ rows, canEdit, zoom = 'month', anchorDate, onReschedule, onClickTask, onReassign }: Props) {
  const DAY_WIDTH = DAY_WIDTH_BY_ZOOM[zoom];
  const allTasks = rows.flatMap((r) => r.tasks);
  const computed = allTasks
    .map((t) => ({ task: t, dates: resolveDates(t) }))
    .filter((x): x is { task: GanttTask; dates: { start: Date; end: Date } } => x.dates !== null);

  const anchor = useMemo(() => startOfDay(anchorDate ?? new Date()), [anchorDate]);

  const range = useMemo(() => {
    if (zoom === 'day') {
      return { start: addDays(anchor, -1), end: addDays(anchor, 1) };
    }
    if (zoom === 'week') {
      const monday = startOfISOWeek(anchor);
      return { start: monday, end: addDays(monday, 6) };
    }
    // month: auto-fit to tasks if any, else anchor ±30 days
    if (computed.length === 0) {
      return { start: addDays(anchor, -7), end: addDays(anchor, 30) };
    }
    const mins = computed.map((c) => c.dates.start.getTime());
    const maxs = computed.map((c) => c.dates.end.getTime());
    const rawStart = startOfDay(addDays(new Date(Math.min(...mins)), -7));
    const rawEnd = startOfDay(addDays(new Date(Math.max(...maxs)), 14));
    const anchorEarly = addDays(anchor, -14);
    const anchorLate = addDays(anchor, 45);
    return {
      start: rawStart < anchorEarly ? rawStart : anchorEarly,
      end: rawEnd > anchorLate ? rawEnd : anchorLate,
    };
  }, [zoom, anchor, computed]);

  const totalDays = differenceInCalendarDays(range.end, range.start) + 1;
  const totalWidth = totalDays * DAY_WIDTH;
  const today = startOfDay(new Date());
  const todayOffset = differenceInCalendarDays(today, range.start);
  const anchorOffset = differenceInCalendarDays(anchor, range.start);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    if (zoom === 'month' && todayOffset >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset * DAY_WIDTH - 200);
    } else if (zoom === 'day' && anchorOffset >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, anchorOffset * DAY_WIDTH - 40);
    } else {
      scrollRef.current.scrollLeft = 0;
    }
  }, [zoom, todayOffset, anchorOffset, DAY_WIDTH]);

  const months = useMemo(() => {
    const result: { label: string; days: number; startOffset: number }[] = [];
    let cursor = range.start;
    let offset = 0;
    while (cursor <= range.end) {
      const monthStart = cursor;
      let days = 0;
      while (cursor <= range.end && isSameMonth(cursor, monthStart)) {
        days++;
        cursor = addDays(cursor, 1);
      }
      result.push({ label: format(monthStart, 'LLLL yyyy'), days, startOffset: offset });
      offset += days;
    }
    return result;
  }, [range]);

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="relative" style={{ display: 'flex' }}>
        <div
          className="shrink-0 bg-white border-r border-black/5 z-20 sticky left-0"
          style={{ width: LABEL_WIDTH }}
        >
          <div className="h-[68px] border-b border-black/5" />
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 px-4 border-b border-black/5"
              style={{ height: r.tasks.length > 0 ? r.tasks.length * ROW_HEIGHT + 12 : ROW_HEIGHT }}
            >
              {r.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fluent-neutral-90 truncate">{r.label}</div>
                {r.sublabel && <div className="text-[11px] text-fluent-neutral-60 truncate">{r.sublabel}</div>}
              </div>
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-visible">
          <div style={{ width: totalWidth, position: 'relative' }}>
            <div className="flex h-9 border-b border-black/5" style={{ width: totalWidth }}>
              {months.map((m) => (
                <div
                  key={m.startOffset}
                  className="text-xs font-semibold text-fluent-neutral-80 px-2 flex items-center border-r border-black/5 bg-fluent-neutral-4"
                  style={{ width: m.days * DAY_WIDTH }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            <div className="flex h-7 border-b border-black/5 bg-white" style={{ width: totalWidth }}>
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = addDays(range.start, i);
                const weekend = isWeekend(d);
                const isToday = i === todayOffset;
                return (
                  <div
                    key={i}
                    className={`flex flex-col items-center justify-center text-[10px] border-r border-black/5 ${
                      weekend ? 'bg-fluent-neutral-4' : ''
                    } ${isToday ? 'bg-fluent-blue-50' : ''}`}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span className="text-fluent-neutral-50">{format(d, 'EEE')}</span>
                    <span className={`font-semibold ${isToday ? 'text-fluent-blue-700' : 'text-fluent-neutral-80'}`}>{format(d, 'd')}</span>
                  </div>
                );
              })}
            </div>

            {zoom === 'day' && (
              <div className="flex h-5 border-b border-black/5 bg-fluent-neutral-4/30" style={{ width: totalWidth }}>
                {Array.from({ length: totalDays }).map((_, i) => (
                  <div
                    key={i}
                    className="flex border-r border-black/5"
                    style={{ width: DAY_WIDTH }}
                  >
                    {Array.from({ length: 24 }).map((__, h) => {
                      const isBusiness = h >= BUSINESS_START_HOUR && h < BUSINESS_END_HOUR;
                      return (
                        <div
                          key={h}
                          className={`flex items-center justify-center text-[9px] border-r border-black/5 last:border-r-0 ${
                            isBusiness ? 'text-fluent-neutral-70 bg-white/60' : 'text-fluent-neutral-40'
                          }`}
                          style={{ width: DAY_WIDTH / 24 }}
                        >
                          {h % 2 === 0 ? String(h).padStart(2, '0') : ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {todayOffset >= 0 && todayOffset < totalDays && (
              <div
                className="absolute top-0 bottom-0 w-px bg-fluent-blue-500 z-10 pointer-events-none"
                style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
              />
            )}

            <div style={{ width: totalWidth }}>
              {rows.map((r) => (
                <GanttRowGrid
                  key={r.id}
                  row={r}
                  rangeStart={range.start}
                  totalDays={totalDays}
                  dayWidth={DAY_WIDTH}
                  zoom={zoom}
                  canEdit={canEdit}
                  onReschedule={onReschedule}
                  onClickTask={onClickTask}
                  onReassign={onReassign}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttRowGrid({
  row,
  rangeStart,
  totalDays,
  dayWidth,
  zoom,
  canEdit,
  onReschedule,
  onClickTask,
  onReassign,
}: {
  row: GanttRow;
  rangeStart: Date;
  totalDays: number;
  dayWidth: number;
  zoom: GanttZoom;
  canEdit: boolean;
  onReschedule?: (taskId: string, startDate: Date, dueDate: Date) => void;
  onClickTask?: (task: GanttTask) => void;
  onReassign?: (task: GanttTask) => void;
}) {
  const lanes = row.tasks.length;
  const height = Math.max(ROW_HEIGHT, lanes * ROW_HEIGHT + 12);

  return (
    <div className="relative border-b border-black/5" style={{ height }}>
      <div className="absolute inset-0 flex" style={{ width: totalDays * dayWidth }}>
        {Array.from({ length: totalDays }).map((_, i) => {
          const d = addDays(rangeStart, i);
          return (
            <div
              key={i}
              className={`border-r border-black/5 ${isWeekend(d) ? 'bg-fluent-neutral-4/40' : ''}`}
              style={{ width: dayWidth }}
            />
          );
        })}
      </div>
      <div className="relative" style={{ height }}>
        {row.tasks.map((task, idx) => (
          <GanttBar
            key={task.id}
            task={task}
            rangeStart={rangeStart}
            dayWidth={dayWidth}
            zoom={zoom}
            lane={idx}
            canEdit={canEdit}
            onReschedule={onReschedule}
            onClickTask={onClickTask}
            onReassign={onReassign}
          />
        ))}
      </div>
    </div>
  );
}

type Drag =
  | { mode: 'move'; startX: number; origStart: Date; origEnd: Date }
  | { mode: 'resize-end'; startX: number; origStart: Date; origEnd: Date }
  | { mode: 'resize-start'; startX: number; origStart: Date; origEnd: Date };

function GanttBar({
  task,
  rangeStart,
  dayWidth,
  zoom,
  lane,
  canEdit,
  onReschedule,
  onClickTask,
  onReassign,
}: {
  task: GanttTask;
  rangeStart: Date;
  dayWidth: number;
  zoom: GanttZoom;
  lane: number;
  canEdit: boolean;
  onReschedule?: (taskId: string, startDate: Date, dueDate: Date) => void;
  onClickTask?: (task: GanttTask) => void;
  onReassign?: (task: GanttTask) => void;
}) {
  const dates = resolveDates(task);
  if (!dates) return null;

  const [drag, setDrag] = useState<Drag | null>(null);
  const [override, setOverride] = useState<{ start: Date; end: Date } | null>(null);
  const [hover, setHover] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);

  const effective = override ?? dates;
  const startOffset = differenceInCalendarDays(effective.start, rangeStart);
  const durationDays = Math.max(1, differenceInCalendarDays(effective.end, effective.start) + 1);
  const workingDays = Math.max(1, countWorkingDays(effective.start, effective.end));
  const workingHours = workingDays * HOURS_PER_WORKDAY;

  // In day zoom with a real time component, render with hour precision.
  const rawStart = task.startDate;
  const rawDue = task.dueDate;
  const hasTime =
    !override &&
    zoom === 'day' &&
    ((rawStart && (rawStart.getHours() !== 0 || rawStart.getMinutes() !== 0)) ||
      (rawDue && (rawDue.getHours() !== 0 || rawDue.getMinutes() !== 0)));

  let left = startOffset * dayWidth;
  let width = durationDays * dayWidth - 4;
  if (hasTime && rawStart && rawDue) {
    const startMin = rawStart.getHours() * 60 + rawStart.getMinutes();
    const endMin = rawDue.getHours() * 60 + rawDue.getMinutes();
    const startDayOffset = differenceInCalendarDays(rawStart, rangeStart);
    const endDayOffset = differenceInCalendarDays(rawDue, rangeStart);
    left = startDayOffset * dayWidth + (startMin / (24 * 60)) * dayWidth;
    const endPx = endDayOffset * dayWidth + (endMin / (24 * 60)) * dayWidth;
    width = Math.max(24, endPx - left - 2);
  }
  const top = lane * ROW_HEIGHT + 6;

  const color = statusColor(task.status);

  const onPointerDown = useCallback(
    (mode: Drag['mode']) => (e: React.PointerEvent) => {
      if (!canEdit || !onReschedule) return;
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragMovedRef.current = false;
      setDrag({ mode, startX: e.clientX, origStart: effective.start, origEnd: effective.end });
    },
    [canEdit, onReschedule, effective.start, effective.end],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      const deltaPx = e.clientX - drag.startX;
      const deltaDays = Math.round(deltaPx / dayWidth);
      if (deltaDays === 0 && !dragMovedRef.current) return;
      dragMovedRef.current = Math.abs(deltaPx) > 2 || dragMovedRef.current;
      if (drag.mode === 'move') {
        setOverride({
          start: addDays(drag.origStart, deltaDays),
          end: addDays(drag.origEnd, deltaDays),
        });
      } else if (drag.mode === 'resize-end') {
        const newEnd = addDays(drag.origEnd, deltaDays);
        setOverride({ start: drag.origStart, end: newEnd >= drag.origStart ? newEnd : drag.origStart });
      } else if (drag.mode === 'resize-start') {
        const newStart = addDays(drag.origStart, deltaDays);
        setOverride({ start: newStart <= drag.origEnd ? newStart : drag.origEnd, end: drag.origEnd });
      }
    },
    [drag, dayWidth],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      const final = override;
      setDrag(null);
      setOverride(null);
      if (final && onReschedule && dragMovedRef.current) {
        onReschedule(task.id, final.start, final.end);
      }
    },
    [drag, override, onReschedule, task.id],
  );

  const onClick = (e: React.MouseEvent) => {
    if (dragMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClickTask?.(task);
  };

  return (
    <div
      ref={barRef}
      className={`absolute rounded-md shadow-fluent-2 flex items-center gap-1.5 px-2 overflow-hidden select-none transition-shadow ${
        hover || drag ? 'shadow-fluent-8 ring-2 ring-white' : ''
      } ${canEdit && onReschedule ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{
        left,
        width,
        top,
        height: ROW_HEIGHT - 12,
        background: color,
        opacity: drag ? 0.85 : 1,
      }}
      onPointerDown={onPointerDown('move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {canEdit && onReschedule && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30"
          onPointerDown={onPointerDown('resize-start')}
        />
      )}

      <div className="flex items-center gap-1 shrink-0">
        {task.assignees.slice(0, 3).map((a) => (
          <div key={a.id} className="-ml-1 first:ml-0">
            <Avatar user={a} size="xs" />
          </div>
        ))}
      </div>

      <span className="text-xs font-semibold text-white truncate flex-1">{task.title}</span>

      {task.estimatedHours !== null && (
        <span className="text-[10px] text-white/80 tabular-nums shrink-0">{task.estimatedHours}h</span>
      )}

      {canEdit && onReschedule && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30"
          onPointerDown={onPointerDown('resize-end')}
        />
      )}

      {hover && !drag && (
        <div
          className="absolute left-0 top-full mt-1 z-20 bg-white text-fluent-neutral-90 rounded-lg shadow-fluent-16 border border-black/5 p-3 w-64 pointer-events-none"
          style={{ color: 'inherit' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: task.projectColor }} />
            <span className="text-[11px] text-fluent-neutral-60 truncate">{task.projectName}</span>
          </div>
          <div className="text-sm font-semibold text-fluent-neutral-95 mb-1.5">{task.title}</div>
          <div className="text-xs text-fluent-neutral-70 space-y-0.5">
            <div>📅 {format(effective.start, 'PP')} → {format(effective.end, 'PP')}</div>
            <div>
              ⏱ {durationDays} ημ. ημερολογίου · {workingDays} εργ. = {workingHours}h
              {task.estimatedHours !== null ? ` · εκτίμηση ${task.estimatedHours}h` : ''}
            </div>
            <div>🏷 {task.status} · {task.priority}</div>
            {task.assignees.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {task.assignees.map((a) => (
                  <span key={a.id} className="text-[11px] bg-fluent-neutral-4 px-1.5 py-0.5 rounded">{a.name}</span>
                ))}
              </div>
            )}
          </div>
          {canEdit && onReassign && (
            <div className="mt-2 pt-2 border-t border-black/5 text-[11px] text-fluent-blue-600">Κλικ για επεξεργασία</div>
          )}
        </div>
      )}
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'done':
      return '#107C41';
    case 'in_progress':
      return '#0078D4';
    case 'review':
      return '#7719AA';
    case 'todo':
      return '#6264A7';
    case 'backlog':
      return '#8A8886';
    default:
      return '#6264A7';
  }
}
