'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { addDays, differenceInCalendarDays, startOfDay, format, isSameMonth, isWeekend } from 'date-fns';
import { ChevronDown16Regular as ChevronDown16 } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { BUSINESS_START_HOUR, BUSINESS_END_HOUR } from '@/lib/business-hours';

// Task status → visual metadata for the expanded left-column detail rows.
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Σε έλεγχο',
  done: 'Ολοκληρώθηκε',
};
const STATUS_DOT: Record<string, string> = {
  backlog: '#9AA0A6',
  todo: '#616161',
  in_progress: '#0078D4',
  review: '#8764B8',
  done: '#107C41',
};

/** Compact "start – due" label (e.g. "17 Ιουλ – 19 Ιουλ"); falls back gracefully. */
function formatTaskRange(t: GanttTask): string {
  const fmt = (d: Date) => format(d, 'd MMM');
  if (t.startDate && t.dueDate) {
    const s = fmt(t.startDate);
    const e = fmt(t.dueDate);
    return s === e ? s : `${s} – ${e}`;
  }
  if (t.dueDate) return `→ ${fmt(t.dueDate)}`;
  if (t.startDate) return `${fmt(t.startDate)} →`;
  return 'Χωρίς ημερομηνία';
}

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
  /** IDs of tasks that must complete before this one. Used to draw arrows on the timeline. */
  dependencyIds?: string[];
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
  /** Set of row ids that are collapsed (show only the project summary bar). */
  collapsed?: Set<string>;
  /** Toggle a project row between collapsed and expanded (per-task lanes). */
  onToggleRow?: (rowId: string) => void;
};

/**
 * Vertical layout for one project row, driven by collapse state.
 * - Every row has a clickable header band of height ROW_HEIGHT.
 * - Collapsed: header only (a single summary bar renders inside it). height = ROW_HEIGHT.
 * - Expanded: header + one lane per task (+12px bottom pad). Task lanes are offset
 *   down by ROW_HEIGHT so they sit below the header, on both the left labels and
 *   the right bars (and the dependency-arrow layer) — keeping all three aligned.
 */
const HEADER_H = ROW_HEIGHT;
function rowLayout(row: GanttRow, isCollapsed: boolean): { lanes: number; height: number } {
  const lanes = isCollapsed ? 0 : row.tasks.length;
  const height = HEADER_H + (isCollapsed ? 0 : row.tasks.length * ROW_HEIGHT + 12);
  return { lanes, height };
}

/** Earliest start / latest end across a project's dated tasks, for the collapsed summary bar. */
function projectSpan(row: GanttRow): { start: Date; end: Date } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const t of row.tasks) {
    const d = resolveDates(t);
    if (!d) continue;
    if (d.start.getTime() < min) min = d.start.getTime();
    if (d.end.getTime() > max) max = d.end.getTime();
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { start: new Date(min), end: new Date(max) };
}

function resolveDates(task: GanttTask): { start: Date; end: Date } | null {
  if (!task.startDate && !task.dueDate) return null;
  const hoursDays = Math.max(1, Math.ceil((task.estimatedHours ?? 8) / 8));
  const end = task.dueDate ? startOfDay(task.dueDate) : startOfDay(addDays(task.startDate!, hoursDays - 1));
  const start = task.startDate ? startOfDay(task.startDate) : startOfDay(addDays(end, -(hoursDays - 1)));
  if (end < start) return { start: end, end: start };
  return { start, end };
}

export function Gantt({ rows, canEdit, zoom = 'month', anchorDate, onReschedule, onClickTask, onReassign, collapsed, onToggleRow }: Props) {
  const DAY_WIDTH = DAY_WIDTH_BY_ZOOM[zoom];
  const isCollapsed = (id: string) => collapsed?.has(id) ?? false;
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
          {rows.map((r) => {
            const rowCollapsed = isCollapsed(r.id);
            const { height } = rowLayout(r, rowCollapsed);
            return (
              <div key={r.id} className="border-b border-black/5" style={{ height }}>
                {/* Project header — click to expand/collapse */}
                <button
                  type="button"
                  onClick={() => onToggleRow?.(r.id)}
                  className="w-full flex items-center gap-2 px-3 text-left hover:bg-fluent-neutral-4 transition-colors"
                  style={{ height: HEADER_H }}
                  aria-expanded={!rowCollapsed}
                >
                  <ChevronDown16
                    className={`h-4 w-4 shrink-0 text-fluent-neutral-60 transition-transform ${rowCollapsed ? '-rotate-90' : ''}`}
                  />
                  {r.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-fluent-neutral-90 truncate">{r.label}</div>
                    {r.sublabel && <div className="text-[11px] text-fluent-neutral-60 truncate">{r.sublabel}</div>}
                  </div>
                </button>
                {/* Expanded: one detail row per task, aligned to its bar lane on the right */}
                {!rowCollapsed &&
                  r.tasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onClickTask?.(t)}
                      className="w-full flex items-center gap-2 pl-9 pr-3 text-left border-t border-black/5 hover:bg-fluent-neutral-4 transition-colors"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[t.status] ?? '#9AA0A6' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-fluent-neutral-90 truncate">{t.title}</div>
                        <div className="text-[10px] text-fluent-neutral-60 truncate">
                          {formatTaskRange(t)} · {STATUS_LABEL[t.status] ?? t.status}
                        </div>
                      </div>
                      {t.assignees[0] && (
                        <Avatar
                          user={{ name: t.assignees[0].name, avatarUrl: t.assignees[0].avatarUrl }}
                          size="xs"
                        />
                      )}
                    </button>
                  ))}
              </div>
            );
          })}
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
                const dow = d.getDay();
                const isSat = dow === 6;
                const isSun = dow === 0;
                const isToday = i === todayOffset;
                return (
                  <div
                    key={i}
                    className={`flex flex-col items-center justify-center text-[10px] border-r border-black/5 ${
                      isSat
                        ? 'bg-amber-50'
                        : isSun
                        ? 'bg-rose-50'
                        : ''
                    } ${isToday ? 'bg-fluent-blue-50' : ''}`}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span
                      className={`${
                        isSat ? 'text-amber-700' : isSun ? 'text-rose-700' : 'text-fluent-neutral-50'
                      }`}
                    >
                      {format(d, 'EEE')}
                    </span>
                    <span
                      className={`font-semibold ${
                        isToday
                          ? 'text-fluent-blue-700'
                          : isSat
                          ? 'text-amber-800'
                          : isSun
                          ? 'text-rose-800'
                          : 'text-fluent-neutral-80'
                      }`}
                    >
                      {format(d, 'd')}
                    </span>
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

            <div style={{ width: totalWidth, position: 'relative' }}>
              {rows.map((r) => (
                <GanttRowGrid
                  key={r.id}
                  row={r}
                  collapsed={isCollapsed(r.id)}
                  rangeStart={range.start}
                  totalDays={totalDays}
                  dayWidth={DAY_WIDTH}
                  zoom={zoom}
                  canEdit={canEdit}
                  onReschedule={onReschedule}
                  onClickTask={onClickTask}
                  onReassign={onReassign}
                  onToggleRow={onToggleRow}
                />
              ))}
              <DependencyArrowsLayer
                rows={rows}
                collapsed={collapsed}
                rangeStart={range.start}
                dayWidth={DAY_WIDTH}
                zoom={zoom}
                totalWidth={totalWidth}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * SVG overlay drawing curved arrows from each prerequisite task's right edge to
 * the dependent task's left edge. Sits on top of the bars but is non-interactive
 * (pointer-events: none) so dragging/clicking still hits the bars below.
 */
function DependencyArrowsLayer({
  rows,
  collapsed,
  rangeStart,
  dayWidth,
  zoom,
  totalWidth,
}: {
  rows: GanttRow[];
  collapsed?: Set<string>;
  rangeStart: Date;
  dayWidth: number;
  zoom: GanttZoom;
  totalWidth: number;
}) {
  type TaskPos = { left: number; right: number; y: number };
  const positions = new Map<string, TaskPos>();

  let yOffset = 0;
  let totalHeight = 0;
  for (const row of rows) {
    const rowCollapsed = collapsed?.has(row.id) ?? false;
    const { height: rowHeight } = rowLayout(row, rowCollapsed);

    // Collapsed rows have no per-task lanes → their tasks get no anchor and any
    // arrow touching them is skipped below.
    if (!rowCollapsed) {
      row.tasks.forEach((task, idx) => {
        const dates = resolveDates(task);
        if (!dates) return;

        // Match GanttBar's positioning logic
        const startOffset = differenceInCalendarDays(dates.start, rangeStart);
        const durationDays = Math.max(1, differenceInCalendarDays(dates.end, dates.start) + 1);

        const rawStart = task.startDate;
        const rawDue = task.dueDate;
        const hasTime =
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
        // Lanes are offset below the header band; mirror GanttRowGrid's layout.
        const top = HEADER_H + idx * ROW_HEIGHT + 6;
        // Mid-bar Y. Bars render with `flex` filling lane height; vertical center
        // ~= top + (ROW_HEIGHT - top-padding) / 2. Using 22 matches the rendered look.
        const y = yOffset + top + 22;
        positions.set(task.id, { left, right: left + width, y });
      });
    }

    yOffset += rowHeight;
  }
  totalHeight = yOffset;

  // Build edge list from each task's dependencyIds
  const edges: Array<{ src: TaskPos; dst: TaskPos; key: string }> = [];
  for (const row of rows) {
    for (const task of row.tasks) {
      const dst = positions.get(task.id);
      if (!dst || !task.dependencyIds || task.dependencyIds.length === 0) continue;
      for (const depId of task.dependencyIds) {
        const src = positions.get(depId);
        if (!src) continue;
        edges.push({ src, dst, key: `${depId}->${task.id}` });
      }
    }
  }

  if (edges.length === 0 || totalHeight === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={totalWidth}
      height={totalHeight}
      style={{ overflow: 'visible' }}
      aria-hidden
    >
      <defs>
        <marker
          id="gantt-dep-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8764B8" />
        </marker>
      </defs>
      {edges.map(({ src, dst, key }) => {
        // Anchor at src's right edge → dst's left edge.
        const sx = src.right;
        const sy = src.y;
        const tx = dst.left;
        const ty = dst.y;
        // Curve control points push horizontally so the arrow loops cleanly
        // even when the dependent is to the left of (or stacked above) the prereq.
        const horizontalGap = Math.max(20, Math.abs(tx - sx) / 2);
        const c1x = sx + horizontalGap;
        const c2x = tx - horizontalGap;
        const path = `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
        return (
          <g key={key}>
            <path
              d={path}
              fill="none"
              stroke="#8764B8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              markerEnd="url(#gantt-dep-arrow)"
              opacity={0.85}
            />
          </g>
        );
      })}
    </svg>
  );
}

function GanttRowGrid({
  row,
  collapsed,
  rangeStart,
  totalDays,
  dayWidth,
  zoom,
  canEdit,
  onReschedule,
  onClickTask,
  onReassign,
  onToggleRow,
}: {
  row: GanttRow;
  collapsed?: boolean;
  rangeStart: Date;
  totalDays: number;
  dayWidth: number;
  zoom: GanttZoom;
  canEdit: boolean;
  onReschedule?: (taskId: string, startDate: Date, dueDate: Date) => void;
  onClickTask?: (task: GanttTask) => void;
  onReassign?: (task: GanttTask) => void;
  onToggleRow?: (rowId: string) => void;
}) {
  const isCollapsed = collapsed ?? false;
  const { height } = rowLayout(row, isCollapsed);

  // Collapsed summary bar geometry (spans the project's earliest start → latest end).
  const span = isCollapsed ? projectSpan(row) : null;
  let summaryLeft = 0;
  let summaryWidth = 0;
  if (span) {
    const startOffset = differenceInCalendarDays(span.start, rangeStart);
    const durationDays = Math.max(1, differenceInCalendarDays(span.end, span.start) + 1);
    summaryLeft = startOffset * dayWidth;
    summaryWidth = Math.max(dayWidth, durationDays * dayWidth - 4);
  }

  return (
    <div className="relative border-b border-black/5" style={{ height }}>
      <div className="absolute inset-0 flex" style={{ width: totalDays * dayWidth }}>
        {Array.from({ length: totalDays }).map((_, i) => {
          const d = addDays(rangeStart, i);
          const dow = d.getDay();
          const isSat = dow === 6;
          const isSun = dow === 0;
          return (
            <div
              key={i}
              className={`border-r border-black/5 ${
                isSat
                  ? 'bg-amber-50/60'
                  : isSun
                  ? 'bg-rose-50/60'
                  : ''
              }`}
              style={{ width: dayWidth }}
            />
          );
        })}
      </div>
      <div className="relative" style={{ height }}>
        {isCollapsed ? (
          span && (
            <button
              type="button"
              onClick={() => onToggleRow?.(row.id)}
              title={`${row.label} — ${row.tasks.length} εργασίες`}
              className="absolute rounded-md opacity-80 hover:opacity-100 transition-opacity"
              style={{
                left: summaryLeft,
                width: summaryWidth,
                top: (HEADER_H - 16) / 2,
                height: 16,
                background: row.color ?? '#0078D4',
              }}
            />
          )
        ) : (
          row.tasks.map((task, idx) => (
            <GanttBar
              key={task.id}
              task={task}
              rangeStart={rangeStart}
              dayWidth={dayWidth}
              zoom={zoom}
              lane={idx}
              topOffset={HEADER_H}
              canEdit={canEdit}
              onReschedule={onReschedule}
              onClickTask={onClickTask}
              onReassign={onReassign}
            />
          ))
        )}
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
  topOffset = 0,
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
  /** Extra vertical offset (e.g. the project header band) added above the lane. */
  topOffset?: number;
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
  const top = topOffset + lane * ROW_HEIGHT + 6;

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
