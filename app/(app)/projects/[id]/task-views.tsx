'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  Add16Filled, Edit20Regular, Delete20Regular,
} from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, statusLabel } from '@/lib/utils';
import {
  TaskForm,
  TaskModal,
  type TaskStatus,
  type TaskPriority,
  type TaskAssigneeOption,
  type TaskOption,
} from './task-form';
import type { TaskQuestionInfo, ProjectMemberOption } from './task-questions-panel';
import { createTask, updateTask, deleteTask, updateTaskStatus, updateTaskDates } from './task-actions';
import { Gantt, type GanttTask, type GanttZoom } from '@/components/gantt/gantt';
import { ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons';
import { SpentTimeBadge } from './spent-time-badge';
import {
  ResolutionDialog,
  checkResolutionPrompt,
  type ResolutionPromptInfo,
} from '@/components/tickets/resolution-dialog';
import { computeSpentMs, formatSpent } from '@/lib/task-in-progress-timer';

export type TaskAttachment = {
  id: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
  createdAt: Date;
};

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: Date | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  completedAt: Date | null;
  assignees: Array<{ id: string; name: string; avatarUrl?: string }>;
  attachments: TaskAttachment[];
  questions: TaskQuestionInfo[];
  addToCalendar: boolean;
  addToTeams: boolean;
  dependencyIds: string[];
  // In-progress wall-clock tracking: spent time is accumulated while the task
  // sits in status=in_progress.
  inProgressStartedAt: Date | null;
  inProgressAccumulatedMs: number;
  // Customer-role redaction marker: when true, only `title` and `status` are
  // meaningful; all other fields are blank placeholders.
  _redacted?: boolean;
};

const STATUS_ORDER: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];
const PRIORITY_VARIANT: Record<TaskPriority, 'red' | 'orange' | 'blue' | 'neutral'> = {
  urgent: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'neutral',
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Επείγουσα',
  high: 'Υψηλή',
  medium: 'Μεσαία',
  low: 'Χαμηλή',
};

type ViewProps = {
  projectId: string;
  projectCode?: string | null;
  tasks: TaskRow[];
  members: TaskAssigneeOption[];
  canEdit: boolean;
  questionMembers: ProjectMemberOption[];
  currentUserId: string;
  isPrivileged: boolean;
};

function useTaskMutations(projectId: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resolutionPrompt, setResolutionPrompt] = useState<ResolutionPromptInfo | null>(null);

  const create = (fd: FormData) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      startTransition(async () => {
        const res = await createTask(projectId, fd);
        router.refresh();
        resolve(res ?? { ok: true });
      });
    });

  const update = (taskId: string, fd: FormData) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      startTransition(async () => {
        const res = await updateTask(projectId, taskId, fd);
        // Ολοκλήρωση μέσα από τη φόρμα επεξεργασίας: ζήτα λύση για το ticket
        // (ο server ελέγχει ότι το task είναι όντως done και ότι λείπει λύση).
        if ((res?.ok ?? true) && fd.get('status') === 'done') {
          const info = await checkResolutionPrompt(taskId);
          if (info) setResolutionPrompt(info);
        }
        router.refresh();
        resolve(res ?? { ok: true });
      });
    });

  const remove = (taskId: string) => {
    if (!confirm('Να διαγραφεί η εργασία;')) return;
    startTransition(async () => {
      await deleteTask(projectId, taskId);
      router.refresh();
    });
  };

  const setStatus = (taskId: string, status: TaskStatus) => {
    startTransition(async () => {
      const res = await updateTaskStatus(projectId, taskId, status);
      if (res && !res.ok && res.error) {
        alert(res.error);
      } else if (status === 'done') {
        const info = await checkResolutionPrompt(taskId);
        if (info) setResolutionPrompt(info);
      }
      router.refresh();
    });
  };

  const resolutionDialog = resolutionPrompt ? (
    <ResolutionDialog info={resolutionPrompt} onClose={() => setResolutionPrompt(null)} />
  ) : null;

  return { create, update, remove, setStatus, pending, resolutionDialog };
}

export function ListView({ projectId, projectCode, tasks, members, canEdit, questionMembers, currentUserId, isPrivileged }: ViewProps) {
  const mutations = useTaskMutations(projectId);
  const [creating, setCreating] = useState(false);
  // Track only the id; derive `editing` from the live `tasks` array so router.refresh()
  // (e.g. after asking/answering a question) re-feeds the modal with fresh data.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => (editingId ? tasks.find((t) => t.id === editingId) ?? null : null),
    [editingId, tasks],
  );
  const setEditing = (t: TaskRow | null) => setEditingId(t?.id ?? null);
  const taskOptions: TaskOption[] = useMemo(
    () => tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })),
    [tasks],
  );

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="p-4 border-b border-black/5 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Όλες οι εργασίες ({tasks.length})</h2>
        {canEdit && (
          <Button variant="primary" size="sm" icon={<Add16Filled />} onClick={() => setCreating(true)}>
            Νέα εργασία
          </Button>
        )}
      </div>
      <div className="divide-y divide-black/5">
        {tasks.length === 0 && (
          <div className="p-8 text-center text-sm text-fluent-neutral-60">Δεν υπάρχουν ακόμη εργασίες.</div>
        )}
        {tasks.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.02 }}
            onClick={() => setEditing(t)}
            className="p-4 hover:bg-fluent-neutral-4 transition-colors flex items-center gap-3 cursor-pointer"
          >
            <Badge variant={t.status === 'done' ? 'green' : 'blue'}>{statusLabel(t.status)}</Badge>
            <Badge variant={PRIORITY_VARIANT[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
            <span className="flex-1 text-sm font-medium text-fluent-neutral-90 truncate">{t.title}</span>
            <SpentTimeBadge
              status={t.status}
              inProgressStartedAt={t.inProgressStartedAt}
              inProgressAccumulatedMs={t.inProgressAccumulatedMs}
              estimatedHours={t.estimatedHours}
              size="xs"
            />
            {t.estimatedHours !== null && (
              <span className="text-xs text-fluent-neutral-60 w-16 text-right tabular-nums">{t.estimatedHours}h</span>
            )}
            <span className="text-xs text-fluent-neutral-60 w-24 text-right">
              {t.dueDate ? formatDate(t.dueDate) : '—'}
            </span>
            <AvatarStack users={t.assignees} max={2} size="xs" />
            {canEdit && (
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(t);
                  }}
                  className="h-7 w-7 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
                  aria-label="Επεξεργασία"
                >
                  <Edit20Regular className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    mutations.remove(t.id);
                  }}
                  className="h-7 w-7 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-70"
                  aria-label="Διαγραφή"
                >
                  <Delete20Regular className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {creating && (
          <TaskModal title="Νέα εργασία" onClose={() => setCreating(false)}>
            <TaskForm
              members={members}
              submitLabel="Δημιουργία"
              availableDependencies={taskOptions}
              onCancel={() => setCreating(false)}
              onSubmit={async (fd) => {
                const res = await mutations.create(fd);
                if (res.ok) setCreating(false);
                return res;
              }}
            />
          </TaskModal>
        )}
        {editing && (
          <TaskModal title={canEdit ? 'Επεξεργασία εργασίας' : 'Λεπτομέρειες εργασίας'} onClose={() => setEditing(null)}>
            <TaskForm
              members={members}
              submitLabel="Αποθήκευση"
              projectId={projectId}
              projectCode={projectCode}
              taskId={editing.id}
              attachments={editing.attachments}
              questions={editing.questions}
              questionMembers={questionMembers}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              availableDependencies={taskOptions}
              readOnly={!canEdit}
              initial={{
                title: editing.title,
                description: editing.description,
                status: editing.status,
                priority: editing.priority,
                dueDate: editing.dueDate,
                estimatedHours: editing.estimatedHours,
                assigneeIds: editing.assignees.map((a) => a.id),
                addToCalendar: editing.addToCalendar,
                addToTeams: editing.addToTeams,
                dependencyIds: editing.dependencyIds,
              }}
              onCancel={() => setEditing(null)}
              onSubmit={async (fd) => {
                const res = await mutations.update(editing.id, fd);
                if (res.ok) setEditing(null);
                return res;
              }}
            />
          </TaskModal>
        )}
      </AnimatePresence>

      {mutations.resolutionDialog}
    </div>
  );
}

export function BoardView({ projectId, projectCode, tasks, members, canEdit, questionMembers, currentUserId, isPrivileged }: ViewProps) {
  const mutations = useTaskMutations(projectId);
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => (editingId ? tasks.find((t) => t.id === editingId) ?? null : null),
    [editingId, tasks],
  );
  const setEditing = (t: TaskRow | null) => setEditingId(t?.id ?? null);
  const taskOptions: TaskOption[] = useMemo(
    () => tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })),
    [tasks],
  );
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, TaskRow[]>(STATUS_ORDER.map((s) => [s, [] as TaskRow[]]));
    tasks.forEach((t) => map.get(t.status)?.push(t));
    return map;
  }, [tasks]);

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || !overId.startsWith('col:')) return;
    const newStatus = overId.slice(4) as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    mutations.setStatus(taskId, newStatus);
  }

  const columns = (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {STATUS_ORDER.map((s) => {
        const col = grouped.get(s) ?? [];
        return (
          <BoardColumn
            key={s}
            status={s}
            tasks={col}
            canEdit={canEdit}
            onAdd={() => setCreating(s)}
            onEdit={setEditing}
            useDnd={mounted && canEdit}
          />
        );
      })}
    </div>
  );

  return (
    <>
      {mounted ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => {
            const t = tasks.find((x) => x.id === e.active.id);
            if (t) setActiveTask(t);
          }}
          onDragCancel={() => setActiveTask(null)}
          onDragEnd={handleDragEnd}
        >
          {columns}
          <DragOverlay dropAnimation={null}>
            {activeTask && <BoardCard task={activeTask} isOverlay onEdit={() => {}} useDnd={false} />}
          </DragOverlay>
        </DndContext>
      ) : (
        columns
      )}

      <AnimatePresence>
        {creating && (
          <TaskModal title="Νέα εργασία" onClose={() => setCreating(null)}>
            <TaskForm
              members={members}
              submitLabel="Δημιουργία"
              initial={{
                title: '',
                description: null,
                status: creating,
                priority: 'medium',
                dueDate: null,
                estimatedHours: null,
                assigneeIds: [],
                dependencyIds: [],
              }}
              onCancel={() => setCreating(null)}
              onSubmit={async (fd) => {
                const res = await mutations.create(fd);
                if (res.ok) setCreating(null);
                return res;
              }}
            />
          </TaskModal>
        )}
        {editing && (
          <TaskModal title={canEdit ? 'Επεξεργασία εργασίας' : 'Λεπτομέρειες εργασίας'} onClose={() => setEditing(null)}>
            <TaskForm
              members={members}
              submitLabel="Αποθήκευση"
              projectId={projectId}
              projectCode={projectCode}
              taskId={editing.id}
              attachments={editing.attachments}
              questions={editing.questions}
              questionMembers={questionMembers}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              availableDependencies={taskOptions}
              readOnly={!canEdit}
              initial={{
                title: editing.title,
                description: editing.description,
                status: editing.status,
                priority: editing.priority,
                dueDate: editing.dueDate,
                estimatedHours: editing.estimatedHours,
                assigneeIds: editing.assignees.map((a) => a.id),
                addToCalendar: editing.addToCalendar,
                addToTeams: editing.addToTeams,
                dependencyIds: editing.dependencyIds,
              }}
              onCancel={() => setEditing(null)}
              onSubmit={async (fd) => {
                const res = await mutations.update(editing.id, fd);
                if (res.ok) setEditing(null);
                return res;
              }}
            />
          </TaskModal>
        )}
      </AnimatePresence>

      {mutations.resolutionDialog}
    </>
  );
}

const TIMELINE_ZOOM_LABEL: Record<GanttZoom, string> = {
  day: 'Ημέρα',
  week: 'Εβδομάδα',
  month: 'Μήνας',
};

function shiftTimelineAnchor(d: Date, zoom: GanttZoom, dir: -1 | 1): Date {
  const r = new Date(d);
  if (zoom === 'day') r.setDate(r.getDate() + dir);
  else if (zoom === 'week') r.setDate(r.getDate() + dir * 7);
  else r.setMonth(r.getMonth() + dir);
  return r;
}

function timelineAnchorLabel(d: Date, zoom: GanttZoom): string {
  if (zoom === 'day') {
    return d.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (zoom === 'week') {
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mStr = monday.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
    const sStr = sunday.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${mStr} – ${sStr}`;
  }
  return d.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
}

export function TimelineView({
  projectId,
  projectCode,
  projectName,
  projectColor,
  tasks,
  members,
  canEdit,
  questionMembers,
  currentUserId,
  isPrivileged,
}: ViewProps & { projectName: string; projectColor: string }) {
  const mutations = useTaskMutations(projectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => (editingId ? tasks.find((t) => t.id === editingId) ?? null : null),
    [editingId, tasks],
  );
  const setEditing = (t: TaskRow | null) => setEditingId(t?.id ?? null);
  const taskOptions: TaskOption[] = useMemo(
    () => tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })),
    [tasks],
  );
  const [zoom, setZoom] = useState<GanttZoom>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const router = useRouter();

  const ganttTasks: GanttTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    startDate: t.startDate,
    dueDate: t.dueDate,
    estimatedHours: t.estimatedHours,
    status: t.status,
    priority: t.priority,
    projectId,
    projectName,
    projectColor,
    assignees: t.assignees,
    dependencyIds: t.dependencyIds,
  }));

  const undated = tasks.filter((t) => !t.startDate && !t.dueDate);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-black/5 shadow-fluent-2 p-3">
        <div className="flex items-center gap-1 bg-fluent-neutral-4 rounded-md p-1">
          {(['day', 'week', 'month'] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`text-xs h-7 px-3 rounded font-medium transition-colors ${
                zoom === z ? 'bg-white text-fluent-blue-700 shadow-fluent-2' : 'text-fluent-neutral-70 hover:bg-white/60'
              }`}
            >
              {TIMELINE_ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAnchor((a) => shiftTimelineAnchor(a, zoom, -1))}
            className="h-8 w-8 rounded-md text-fluent-neutral-70 hover:bg-fluent-neutral-4 flex items-center justify-center"
            aria-label="Προηγούμενο"
          >
            <ChevronLeft20Regular />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="h-8 px-3 rounded-md text-xs font-medium text-fluent-neutral-70 hover:bg-fluent-neutral-4"
          >
            Σήμερα
          </button>
          <button
            onClick={() => setAnchor((a) => shiftTimelineAnchor(a, zoom, 1))}
            className="h-8 w-8 rounded-md text-fluent-neutral-70 hover:bg-fluent-neutral-4 flex items-center justify-center"
            aria-label="Επόμενο"
          >
            <ChevronRight20Regular />
          </button>
        </div>
        <span className="text-sm font-semibold text-fluent-neutral-90 truncate">{timelineAnchorLabel(anchor, zoom)}</span>
      </div>

      <Gantt
        rows={[{ id: projectId, label: 'Εργασίες', color: projectColor, tasks: ganttTasks.filter((t) => t.startDate || t.dueDate) }]}
        canEdit={canEdit}
        zoom={zoom}
        anchorDate={anchor}
        onReschedule={async (taskId, startDate, dueDate) => {
          await updateTaskDates(projectId, taskId, { startDate, dueDate });
          router.refresh();
        }}
        onClickTask={(t) => {
          const match = tasks.find((x) => x.id === t.id);
          if (match) setEditing(match);
        }}
      />

      {undated.length > 0 && (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50 mb-2">
            Χωρίς ημερομηνία ({undated.length})
          </p>
          <div className="space-y-1">
            {undated.map((t) => (
              <button
                key={t.id}
                onClick={() => setEditing(t)}
                className="w-full flex items-center gap-3 hover:bg-fluent-neutral-4 rounded-md p-2 text-left"
              >
                <Badge variant={t.status === 'done' ? 'green' : 'blue'}>{statusLabel(t.status)}</Badge>
                <span className="flex-1 text-sm text-fluent-neutral-90 truncate">{t.title}</span>
                {t.estimatedHours !== null && (
                  <span className="text-xs text-fluent-neutral-60 tabular-nums">{t.estimatedHours}h</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <TaskModal title={canEdit ? 'Επεξεργασία εργασίας' : 'Λεπτομέρειες εργασίας'} onClose={() => setEditing(null)}>
            <TaskForm
              members={members}
              submitLabel="Αποθήκευση"
              projectId={projectId}
              projectCode={projectCode}
              taskId={editing.id}
              attachments={editing.attachments}
              questions={editing.questions}
              questionMembers={questionMembers}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              availableDependencies={taskOptions}
              readOnly={!canEdit}
              initial={{
                title: editing.title,
                description: editing.description,
                status: editing.status,
                priority: editing.priority,
                dueDate: editing.dueDate,
                estimatedHours: editing.estimatedHours,
                assigneeIds: editing.assignees.map((a) => a.id),
                addToCalendar: editing.addToCalendar,
                addToTeams: editing.addToTeams,
                dependencyIds: editing.dependencyIds,
              }}
              onCancel={() => setEditing(null)}
              onSubmit={async (fd) => {
                const res = await mutations.update(editing.id, fd);
                if (res.ok) setEditing(null);
                return res;
              }}
            />
          </TaskModal>
        )}
      </AnimatePresence>

      {mutations.resolutionDialog}
    </div>
  );
}

export function ReportsView({
  tasks,
  members,
  regressionCount,
}: {
  tasks: TaskRow[];
  members?: TaskAssigneeOption[];
  regressionCount?: number;
}) {
  const stats = useMemo(() => computeStats(tasks), [tasks]);

  // Live "now" so the spent totals advance for any task currently running.
  // Re-renders once per minute, same cadence as SpentTimeBadge.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Estimated vs Actual: estimate is the sum of estimatedHours (in ms), actual
  // is the wall-clock time tasks have spent in status=in_progress.
  const timeStats = useMemo(() => {
    const estimatedMs = tasks.reduce(
      (acc, t) => acc + (t.estimatedHours ? t.estimatedHours * 3_600_000 : 0),
      0,
    );
    const spentMs = tasks.reduce(
      (acc, t) =>
        acc +
        computeSpentMs(t.status, t.inProgressStartedAt, t.inProgressAccumulatedMs, now),
      0,
    );
    // Per-task spent rows, sorted by spent desc, only those with any spent time.
    const perTask = tasks
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        estimatedMs: t.estimatedHours ? t.estimatedHours * 3_600_000 : 0,
        spentMs: computeSpentMs(t.status, t.inProgressStartedAt, t.inProgressAccumulatedMs, now),
      }))
      .filter((t) => t.spentMs > 0)
      .sort((a, b) => b.spentMs - a.spentMs);
    return { estimatedMs, spentMs, perTask };
  }, [tasks, now]);

  const pctOfEstimate =
    timeStats.estimatedMs > 0
      ? Math.round((timeStats.spentMs / timeStats.estimatedMs) * 100)
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <StatCard label="Σύνολο εργασιών" value={String(stats.total)} />
      <StatCard label="Ολοκληρωμένες" value={`${stats.done} / ${stats.total}`} sub={`${stats.completionPct}%`} />
      <StatCard label="Ποσοστό προόδου" value={`${stats.completionPct}%`} />

      <StatCard label="Συνολικές εκτιμώμενες ώρες" value={formatHours(stats.totalHours)} />
      <StatCard label="Ώρες ολοκληρωμένες" value={formatHours(stats.doneHours)} />
      <StatCard label="Ώρες που απομένουν" value={formatHours(stats.remainingHours)} sub={`~${stats.daysRemaining} εργάσιμες ημέρες (8h/ημ.)`} />

      {/* Estimated vs Actual (wall-clock time in_progress) */}
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-fluent-neutral-90">
            Εκτιμώμενος vs Πραγματικός χρόνος
          </h3>
          {pctOfEstimate !== null && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                pctOfEstimate > 100
                  ? 'bg-fluent-accent-red/10 text-fluent-accent-red'
                  : pctOfEstimate > 80
                  ? 'bg-fluent-accent-orange/10 text-fluent-accent-orange'
                  : 'bg-fluent-accent-green/10 text-fluent-accent-green'
              }`}
            >
              {pctOfEstimate}% της εκτίμησης
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="rounded-lg bg-fluent-neutral-4 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-fluent-neutral-60">
              Εκτίμηση
            </div>
            <div className="text-xl font-semibold font-display tabular-nums">
              {timeStats.estimatedMs > 0 ? formatSpent(timeStats.estimatedMs) : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-fluent-blue-50 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-fluent-blue-700">
              Πραγματικός
            </div>
            <div className="text-xl font-semibold font-display tabular-nums text-fluent-blue-700">
              {timeStats.spentMs > 0 ? formatSpent(timeStats.spentMs) : '—'}
            </div>
          </div>
          <div
            className={`rounded-lg px-3 py-2.5 ${
              timeStats.estimatedMs > 0 && timeStats.spentMs > timeStats.estimatedMs
                ? 'bg-fluent-accent-red/10'
                : 'bg-fluent-neutral-4'
            }`}
          >
            <div className="text-[11px] uppercase tracking-wider text-fluent-neutral-60">
              Διαφορά
            </div>
            <div className="text-xl font-semibold font-display tabular-nums">
              {timeStats.estimatedMs > 0
                ? formatSpent(Math.abs(timeStats.spentMs - timeStats.estimatedMs))
                : '—'}
              {timeStats.estimatedMs > 0 && (
                <span className="text-[11px] font-normal text-fluent-neutral-60 ml-1">
                  {timeStats.spentMs > timeStats.estimatedMs ? 'πάνω' : 'κάτω'}
                </span>
              )}
            </div>
          </div>
        </div>

        {timeStats.perTask.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-fluent-neutral-50 mb-1">
              Ανά εργασία ({timeStats.perTask.length})
            </div>
            {timeStats.perTask.slice(0, 8).map((t) => {
              const pct =
                t.estimatedMs > 0 ? Math.min(200, (t.spentMs / t.estimatedMs) * 100) : null;
              const over = pct !== null && pct > 100;
              return (
                <div key={t.id} className="flex items-center gap-3 text-xs">
                  <span className="flex-1 truncate text-fluent-neutral-90">{t.title}</span>
                  <div className="w-40 h-1.5 rounded-full bg-fluent-neutral-8 overflow-hidden relative">
                    {pct !== null && (
                      <div
                        className={`h-full rounded-full ${
                          over ? 'bg-fluent-accent-red' : 'bg-fluent-blue-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    )}
                  </div>
                  <span className="w-24 text-right tabular-nums text-fluent-neutral-70">
                    {formatSpent(t.spentMs)}
                    {t.estimatedMs > 0 && (
                      <span className="opacity-60"> / {formatSpent(t.estimatedMs)}</span>
                    )}
                  </span>
                </div>
              );
            })}
            {timeStats.perTask.length > 8 && (
              <p className="text-[11px] text-fluent-neutral-60 mt-1.5">
                +{timeStats.perTask.length - 8} ακόμη εργασίες
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-fluent-neutral-60">
            Καμία εργασία δεν έχει μπει σε επεξεργασία ακόμη — ο χρόνος μετράει αυτόματα όταν μια
            εργασία αλλάξει κατάσταση σε «Σε εξέλιξη».
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5 lg:col-span-2">
        <h3 className="font-display text-sm font-semibold text-fluent-neutral-90 mb-3">Κατανομή ανά κατάσταση</h3>
        <div className="space-y-2">
          {STATUS_ORDER.map((s) => {
            const count = stats.byStatus[s] ?? 0;
            const hours = stats.hoursByStatus[s] ?? 0;
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="w-32 text-xs text-fluent-neutral-70">{statusLabel(s)}</span>
                <div className="flex-1 h-2 rounded-full bg-fluent-neutral-4 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: s === 'done' ? '#107C41' : s === 'in_progress' ? '#0078D4' : '#6264A7',
                    }}
                  />
                </div>
                <span className="w-20 text-xs text-fluent-neutral-60 text-right tabular-nums">
                  {count} · {formatHours(hours)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5">
        <h3 className="font-display text-sm font-semibold text-fluent-neutral-90 mb-3">Προτεραιότητα</h3>
        <div className="space-y-2">
          {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => {
            const count = stats.byPriority[p] ?? 0;
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <div key={p} className="flex items-center gap-3">
                <Badge variant={PRIORITY_VARIANT[p]}>{PRIORITY_LABEL[p]}</Badge>
                <div className="flex-1 h-2 rounded-full bg-fluent-neutral-4 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-fluent-blue-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-xs text-fluent-neutral-60 text-right tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Member-focused panels ───────────────────────────────────── */}
      <MemberPanels
        tasks={tasks}
        members={members ?? []}
        now={now}
        regressionCount={regressionCount ?? 0}
      />
    </div>
  );
}

function MemberPanels({
  tasks,
  members,
  now,
  regressionCount,
}: {
  tasks: TaskRow[];
  members: TaskAssigneeOption[];
  now: Date;
  regressionCount: number;
}) {
  // Workload per member: open task count, total estimated, total spent.
  // "Open" = not done. Unassigned tasks bucket into __unassigned for visibility.
  const workload = useMemo(() => {
    const map = new Map<
      string,
      { name: string; open: number; done: number; estimatedMs: number; spentMs: number; pendingQuestions: number }
    >();
    function ensure(id: string, name: string) {
      if (!map.has(id)) {
        map.set(id, { name, open: 0, done: 0, estimatedMs: 0, spentMs: 0, pendingQuestions: 0 });
      }
      return map.get(id)!;
    }
    for (const m of members) ensure(m.id, m.name || m.email);
    for (const t of tasks) {
      const taskSpent = computeSpentMs(
        t.status,
        t.inProgressStartedAt,
        t.inProgressAccumulatedMs,
        now,
      );
      const taskEstimate = t.estimatedHours ? t.estimatedHours * 3_600_000 : 0;
      const assignees = t.assignees.length > 0 ? t.assignees : [{ id: '__unassigned', name: 'Χωρίς ανάθεση' }];
      for (const a of assignees) {
        const row = ensure(a.id, a.name);
        if (t.status === 'done') row.done += 1;
        else row.open += 1;
        row.estimatedMs += taskEstimate;
        row.spentMs += taskSpent;
      }
      // Pending Q&A: count by askedTo person
      for (const q of t.questions) {
        if (!q.answer) {
          const target = q.askedTo;
          const row = ensure(target.id, target.name);
          row.pendingQuestions += 1;
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v, total: v.open + v.done }))
      .filter((r) => r.total > 0 || r.pendingQuestions > 0)
      .sort((a, b) => b.spentMs - a.spentMs || b.open - a.open);
  }, [tasks, members, now]);

  // Velocity: tasks completed grouped by ISO week (last 6 weeks).
  const velocity = useMemo(() => {
    const weeks: { label: string; key: string; count: number; start: Date }[] = [];
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const startOfThisWeek = startOfWeek(now);
    for (let i = 5; i >= 0; i -= 1) {
      const start = new Date(startOfThisWeek.getTime() - i * oneWeekMs);
      weeks.push({
        label: formatWeekLabel(start),
        key: start.toISOString().slice(0, 10),
        start,
        count: 0,
      });
    }
    for (const t of tasks) {
      if (!t.completedAt) continue;
      const compStart = startOfWeek(t.completedAt);
      const bucket = weeks.find((w) => w.start.getTime() === compStart.getTime());
      if (bucket) bucket.count += 1;
    }
    const max = Math.max(1, ...weeks.map((w) => w.count));
    return { weeks, max };
  }, [tasks, now]);

  // Stale tasks: in_progress with inProgressStartedAt older than 7 days, or
  // any open task with dueDate already past. Surfaces things sitting too long.
  const stale = useMemo(() => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const overdueDue: TaskRow[] = [];
    const stuckInProgress: TaskRow[] = [];
    for (const t of tasks) {
      if (t.status === 'done') continue;
      if (t.dueDate && t.dueDate.getTime() < now.getTime()) overdueDue.push(t);
      if (
        t.status === 'in_progress' &&
        t.inProgressStartedAt &&
        now.getTime() - t.inProgressStartedAt.getTime() > sevenDaysMs
      ) {
        stuckInProgress.push(t);
      }
    }
    return { overdueDue, stuckInProgress };
  }, [tasks, now]);

  if (workload.length === 0) {
    return (
      <div className="lg:col-span-3 rounded-xl border border-fluent-neutral-10 bg-white p-5 text-center text-sm text-fluent-neutral-60">
        Δεν υπάρχουν ακόμη μέλη με tasks σε αυτό το έργο.
      </div>
    );
  }

  const maxSpent = Math.max(1, ...workload.map((w) => w.spentMs));
  const totalRegression = regressionCount;

  return (
    <>
      {/* Workload distribution */}
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-display text-sm font-semibold text-fluent-neutral-90">
            Κατανομή φόρτου ανά μέλος
          </h3>
          <span className="text-[11px] text-fluent-neutral-60">
            Ταξινόμηση κατά πραγματικό χρόνο που δαπανήθηκε
          </span>
        </div>
        <div className="space-y-2">
          {workload.map((w) => {
            const pct = (w.spentMs / maxSpent) * 100;
            const overEstimate = w.estimatedMs > 0 && w.spentMs > w.estimatedMs;
            return (
              <div key={w.id} className="flex items-center gap-3 text-xs">
                <span className="w-44 truncate font-medium text-fluent-neutral-90">{w.name}</span>
                <div className="w-14 text-fluent-neutral-60 tabular-nums">
                  {w.open}/{w.total}
                </div>
                <div className="flex-1 h-2 rounded-full bg-fluent-neutral-8 overflow-hidden">
                  <div
                    className={`h-full ${
                      overEstimate ? 'bg-fluent-accent-red' : 'bg-fluent-blue-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-28 text-right tabular-nums text-fluent-neutral-70">
                  {formatSpent(w.spentMs)}
                  {w.estimatedMs > 0 && (
                    <span className="opacity-60"> / {formatSpent(w.estimatedMs)}</span>
                  )}
                </div>
                {w.pendingQuestions > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-fluent-accent-orange/10 text-fluent-accent-orange text-[10px] font-semibold tabular-nums"
                    title={`Εκκρεμούν ${w.pendingQuestions} ερωτήσεις προς αυτόν/αυτή`}
                  >
                    ?{w.pendingQuestions}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-fluent-neutral-60 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full bg-fluent-blue-500" /> εντός εκτίμησης
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full bg-fluent-accent-red" /> πάνω από εκτίμηση
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1 rounded bg-fluent-accent-orange/10 text-fluent-accent-orange">?N</span>{' '}
            εκκρεμή Q&amp;A προς το μέλος
          </span>
        </p>
      </div>

      {/* Velocity */}
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5 lg:col-span-2">
        <h3 className="font-display text-sm font-semibold text-fluent-neutral-90 mb-3">
          Ολοκληρωμένα tasks ανά εβδομάδα (τελευταίες 6)
        </h3>
        <div className="flex items-end gap-2 h-32">
          {velocity.weeks.map((w) => {
            const heightPct = (w.count / velocity.max) * 100;
            return (
              <div key={w.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="text-[10px] text-fluent-neutral-60 tabular-nums">
                  {w.count}
                </div>
                <div className="w-full bg-fluent-neutral-4 rounded-md relative flex-1 flex items-end overflow-hidden">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${heightPct}%` }}
                    transition={{ duration: 0.4 }}
                    className="w-full bg-fluent-blue-500 rounded-md"
                  />
                </div>
                <div className="text-[10px] text-fluent-neutral-50">{w.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quality signals */}
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5">
        <h3 className="font-display text-sm font-semibold text-fluent-neutral-90 mb-3">
          Ποιοτικά σήματα
        </h3>
        <div className="space-y-3">
          <QualityTile
            label="Επιστροφές από review"
            value={totalRegression}
            help="tasks που γύρισαν από review πίσω σε in_progress"
            tone={totalRegression > 0 ? 'warn' : 'good'}
          />
          <QualityTile
            label="Stuck in progress > 7d"
            value={stale.stuckInProgress.length}
            help="ενεργά in_progress για περισσότερο από 7 ημέρες"
            tone={stale.stuckInProgress.length > 0 ? 'warn' : 'good'}
          />
          <QualityTile
            label="Υπερβαίνουν προθεσμία"
            value={stale.overdueDue.length}
            help="open tasks με ημερομηνία λήξης στο παρελθόν"
            tone={stale.overdueDue.length > 0 ? 'warn' : 'good'}
          />
        </div>
      </div>
    </>
  );
}

function QualityTile({
  label,
  value,
  help,
  tone,
}: {
  label: string;
  value: number;
  help: string;
  tone: 'good' | 'warn';
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 border ${
        tone === 'warn'
          ? 'bg-fluent-accent-orange/8 border-fluent-accent-orange/30'
          : 'bg-fluent-accent-green/8 border-fluent-accent-green/30'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-fluent-neutral-70 font-semibold">
          {label}
        </div>
        <div
          className={`text-xl font-semibold font-display tabular-nums ${
            tone === 'warn' ? 'text-fluent-accent-orange' : 'text-fluent-accent-green'
          }`}
        >
          {value}
        </div>
      </div>
      <p className="text-[10px] text-fluent-neutral-60 mt-0.5">{help}</p>
    </div>
  );
}

function startOfWeek(d: Date): Date {
  // ISO week: Monday-start.
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() + diff);
  return out;
}

function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short' });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5">
      <div className="text-xs uppercase tracking-wider text-fluent-neutral-50">{label}</div>
      <div className="text-2xl font-semibold font-display text-fluent-neutral-95 mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-fluent-neutral-60 mt-0.5">{sub}</div>}
    </div>
  );
}

export function computeStats(tasks: TaskRow[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const byStatus: Partial<Record<TaskStatus, number>> = {};
  const hoursByStatus: Partial<Record<TaskStatus, number>> = {};
  const byPriority: Partial<Record<TaskPriority, number>> = {};

  let totalHours = 0;
  let doneHours = 0;
  let remainingHours = 0;

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    const h = t.estimatedHours ?? 0;
    hoursByStatus[t.status] = (hoursByStatus[t.status] ?? 0) + h;
    totalHours += h;
    if (t.status === 'done') doneHours += h;
    else remainingHours += h;
  }

  const daysRemaining = Math.ceil(remainingHours / 8);

  return { total, done, completionPct, byStatus, hoursByStatus, byPriority, totalHours, doneHours, remainingHours, daysRemaining };
}

function formatHours(n: number): string {
  if (!n) return '0h';
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}h`;
}

function BoardColumn({
  status,
  tasks,
  canEdit,
  onAdd,
  onEdit,
  useDnd,
}: {
  status: TaskStatus;
  tasks: TaskRow[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (t: TaskRow) => void;
  useDnd: boolean;
}) {
  const cards = tasks.map((t) => (
    <BoardCard key={t.id} task={t} onEdit={() => onEdit(t)} useDnd={useDnd && canEdit} />
  ));
  const header = (
    <div className="flex items-center justify-between mb-3 px-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-fluent-neutral-90">{statusLabel(status)}</span>
        <span className="text-xs text-fluent-neutral-60">{tasks.length}</span>
      </div>
      {canEdit && (
        <button
          onClick={onAdd}
          className="h-6 w-6 rounded hover:bg-black/5 flex items-center justify-center text-fluent-neutral-60"
          aria-label="Προσθήκη"
        >
          <Add16Filled className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (!useDnd) {
    return (
      <div className="bg-fluent-neutral-4 rounded-xl p-3 min-h-[200px]">
        {header}
        <div className="space-y-2">{cards}</div>
      </div>
    );
  }

  return (
    <DroppableBoardColumn status={status}>
      {header}
      <div className="space-y-2">{cards}</div>
    </DroppableBoardColumn>
  );
}

function DroppableBoardColumn({
  status,
  children,
}: {
  status: TaskStatus;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div
      ref={setNodeRef}
      className={`bg-fluent-neutral-4 rounded-xl p-3 min-h-[200px] transition-colors ${
        isOver ? 'bg-fluent-blue-50 ring-2 ring-fluent-blue-300' : ''
      }`}
    >
      {children}
    </div>
  );
}

function BoardCard({
  task,
  onEdit,
  isOverlay = false,
  useDnd,
}: {
  task: TaskRow;
  onEdit: () => void;
  isOverlay?: boolean;
  useDnd: boolean;
}) {
  if (!useDnd) {
    return (
      <StaticBoardCard task={task} onEdit={onEdit} isOverlay={isOverlay} draggable={false} />
    );
  }
  return <DraggableBoardCard task={task} onEdit={onEdit} isOverlay={isOverlay} />;
}

function DraggableBoardCard({
  task,
  onEdit,
  isOverlay = false,
}: {
  task: TaskRow;
  onEdit: () => void;
  isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <StaticBoardCard
      task={task}
      onEdit={onEdit}
      isOverlay={isOverlay}
      draggable
      isDragging={isDragging}
      ref={setNodeRef}
      style={style}
      dndProps={{ ...listeners, ...attributes }}
    />
  );
}

type CardBaseProps = {
  task: TaskRow;
  onEdit: () => void;
  isOverlay?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
  dndProps?: Record<string, unknown>;
  ref?: React.Ref<HTMLDivElement>;
};

function StaticBoardCard({
  task,
  onEdit,
  isOverlay = false,
  draggable = false,
  isDragging = false,
  style,
  dndProps,
  ref,
}: CardBaseProps) {
  return (
    <motion.div
      ref={ref}
      style={style}
      initial={isOverlay ? undefined : { opacity: 0, y: 4 }}
      animate={isOverlay ? undefined : { opacity: isDragging ? 0.4 : 1, y: 0 }}
      className={`bg-white rounded-lg p-3 shadow-fluent-2 border border-black/5 hover:shadow-fluent-4 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isOverlay ? 'shadow-fluent-16 rotate-2 scale-105' : ''}`}
      onClick={(e) => {
        if (isDragging) return;
        if (task._redacted) return;
        e.stopPropagation();
        onEdit();
      }}
      {...(dndProps ?? {})}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-fluent-neutral-90 line-clamp-2">{task.title}</p>
        <Badge variant={PRIORITY_VARIANT[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
      </div>
      {task.description && (
        <p className="text-xs text-fluent-neutral-60 mt-1 line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2 text-[11px] text-fluent-neutral-60">
          {task.dueDate && <span>{formatDate(task.dueDate)}</span>}
          {task.estimatedHours !== null && <span className="tabular-nums">{task.estimatedHours}h</span>}
        </div>
        <AvatarStack users={task.assignees} max={2} size="xs" />
      </div>
      <div className="mt-2">
        <SpentTimeBadge
          status={task.status}
          inProgressStartedAt={task.inProgressStartedAt}
          inProgressAccumulatedMs={task.inProgressAccumulatedMs}
          estimatedHours={task.estimatedHours}
          size="xs"
        />
      </div>
    </motion.div>
  );
}
