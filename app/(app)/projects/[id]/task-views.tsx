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
      await updateTaskStatus(projectId, taskId, status);
      router.refresh();
    });
  };

  return { create, update, remove, setStatus, pending };
}

export function ListView({ projectId, tasks, members, canEdit, questionMembers, currentUserId, isPrivileged }: ViewProps) {
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
    </div>
  );
}

export function BoardView({ projectId, tasks, members, canEdit, questionMembers, currentUserId, isPrivileged }: ViewProps) {
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
    </div>
  );
}

export function ReportsView({ tasks }: { tasks: TaskRow[] }) {
  const stats = useMemo(() => computeStats(tasks), [tasks]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <StatCard label="Σύνολο εργασιών" value={String(stats.total)} />
      <StatCard label="Ολοκληρωμένες" value={`${stats.done} / ${stats.total}`} sub={`${stats.completionPct}%`} />
      <StatCard label="Ποσοστό προόδου" value={`${stats.completionPct}%`} />

      <StatCard label="Συνολικές εκτιμώμενες ώρες" value={formatHours(stats.totalHours)} />
      <StatCard label="Ώρες ολοκληρωμένες" value={formatHours(stats.doneHours)} />
      <StatCard label="Ώρες που απομένουν" value={formatHours(stats.remainingHours)} sub={`~${stats.daysRemaining} εργάσιμες ημέρες (8h/ημ.)`} />

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
    </div>
  );
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
    </motion.div>
  );
}
