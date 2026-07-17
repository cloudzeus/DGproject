'use client';

import { useState, useMemo, useTransition, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Filter20Regular,
  Person20Regular,
  Flag20Regular,
  Add16Filled,
  ChevronDown16Regular,
  Dismiss12Regular,
} from '@fluentui/react-icons';
import { BoardColumn } from '@/components/board/board-column';
import { TaskCard } from '@/components/board/task-card';
import { TaskDrawer } from '@/components/board/task-drawer';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TaskStatus, Priority as TaskPriority, TaskWithRelations } from '@/types';
import { updateTaskStatus, sendTaskReminder } from './actions';
import { deleteTask } from '@/app/(app)/projects/[id]/task-actions';
import { BoardTaskModal, type BoardProjectOption } from './board-task-modal';
import {
  ResolutionDialog,
  checkResolutionPrompt,
  type ResolutionPromptInfo,
} from '@/components/tickets/resolution-dialog';

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'urgent', label: 'Επείγουσα', color: '#C50F1F' },
  { value: 'high', label: 'Υψηλή', color: '#D83B01' },
  { value: 'medium', label: 'Μεσαία', color: '#0078D4' },
  { value: 'low', label: 'Χαμηλή', color: '#8A8A8A' },
];

const COLUMNS: { id: TaskStatus; accent: string }[] = [
  { id: 'backlog', accent: '#8A8A8A' },
  { id: 'todo', accent: '#0078D4' },
  { id: 'in_progress', accent: '#D83B01' },
  { id: 'review', accent: '#8764B8' },
  { id: 'done', accent: '#107C10' },
];

type HeaderUser = { id: string; name: string; avatarUrl?: string };

interface Props {
  initialTasks: TaskWithRelations[];
  headerUsers: HeaderUser[];
  projects: BoardProjectOption[];
  canCreate: boolean;
  /** Deep-link: /board?task=<id> opens this task's drawer on load. */
  focusTaskId?: string;
}

export function BoardClient({ initialTasks, headerUsers, projects, canCreate, focusTaskId }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskWithRelations | null>(null);
  const [resolutionPrompt, setResolutionPrompt] = useState<ResolutionPromptInfo | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Deep-link (?task=...): open the drawer for the requested task once on load.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTaskId || focusedRef.current === focusTaskId) return;
    const target = initialTasks.find((t) => t.id === focusTaskId);
    if (target) {
      focusedRef.current = focusTaskId;
      setSelectedTask(target);
    }
  }, [focusTaskId, initialTasks]);

  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [openFilter, setOpenFilter] = useState<'assignees' | 'priority' | 'more' | null>(null);

  const currentUserId = useMemo(() => headerUsers[0]?.id ?? null, [headerUsers]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter.length > 0 && !t.assigneeIds.some((id) => assigneeFilter.includes(id))) return false;
      if (priorityFilter.length > 0 && !priorityFilter.includes(t.priority as TaskPriority)) return false;
      if (projectFilter.length > 0 && !projectFilter.includes(t.projectId)) return false;
      if (onlyMine && currentUserId && !t.assigneeIds.includes(currentUserId)) return false;
      return true;
    });
  }, [tasks, assigneeFilter, priorityFilter, projectFilter, onlyMine, currentUserId]);

  const activeFilterCount =
    (assigneeFilter.length > 0 ? 1 : 0) +
    (priorityFilter.length > 0 ? 1 : 0) +
    (projectFilter.length > 0 ? 1 : 0) +
    (onlyMine ? 1 : 0);

  function clearAllFilters() {
    setAssigneeFilter([]);
    setPriorityFilter([]);
    setProjectFilter([]);
    setOnlyMine(false);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const tasksByColumn = useMemo(() => {
    const map: Record<TaskStatus, TaskWithRelations[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const t of filteredTasks) map[t.status].push(t);
    for (const k of Object.keys(map) as TaskStatus[]) {
      map[k].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [filteredTasks]);

  const allAssignees = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; avatarUrl?: string }>();
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (!byId.has(a.id)) byId.set(a.id, a);
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  function persistStatus(taskId: string, status: TaskStatus) {
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, status);
      if (res && !res.ok) {
        if (res.error) alert(res.error);
        setTasks(initialTasks); // snap the card back to its persisted column
        return;
      }
      if (status === 'done') {
        const info = await checkResolutionPrompt(taskId);
        if (info) setResolutionPrompt(info);
      }
    });
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    if (aId === oId) return;

    const dragged = tasks.find((t) => t.id === aId);
    if (!dragged) return;

    if (over.data.current?.type === 'column') {
      const newStatus = over.data.current.status as TaskStatus;
      if (dragged.status !== newStatus) {
        setTasks((prev) => prev.map((t) => (t.id === aId ? { ...t, status: newStatus } : t)));
      }
      return;
    }

    const overTask = tasks.find((t) => t.id === oId);
    if (!overTask) return;
    if (dragged.status !== overTask.status) {
      setTasks((prev) => prev.map((t) => (t.id === aId ? { ...t, status: overTask.status } : t)));
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);

    const dragged = tasks.find((t) => t.id === aId);
    if (!dragged) return;

    const original = initialTasks.find((t) => t.id === aId);
    if (original && original.status !== dragged.status) {
      persistStatus(aId, dragged.status);
    }

    if (aId === oId) return;
    const overTask = tasks.find((t) => t.id === oId);
    if (overTask && dragged.status === overTask.status) {
      const columnTasks = tasks
        .filter((t) => t.status === dragged.status)
        .sort((a, b) => a.order - b.order);
      const oldIndex = columnTasks.findIndex((t) => t.id === aId);
      const newIndex = columnTasks.findIndex((t) => t.id === oId);
      const reordered = arrayMove(columnTasks, oldIndex, newIndex);
      setTasks((prev) =>
        prev.map((t) => {
          const match = reordered.find((r) => r.id === t.id);
          if (!match) return t;
          return { ...t, order: reordered.indexOf(match) };
        }),
      );
    }
  }

  function handleDeleteTask(task: TaskWithRelations) {
    startTransition(async () => {
      const res = await deleteTask(task.projectId, task.id);
      if (res.ok) {
        setSelectedTask(null);
        router.refresh();
      }
    });
  }

  async function handleSendReminder(task: TaskWithRelations, message: string) {
    return sendTaskReminder(task.id, message);
  }

  const editingProjectMembers = useMemo(
    () => (editing ? projects.find((p) => p.id === editing.projectId)?.members ?? [] : []),
    [editing, projects],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="flex items-center justify-between px-6 lg:px-8 py-4 bg-white/60 backdrop-blur border-b border-black/5">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fluent-neutral-95">Πίνακας εργασιών</h1>
          <p className="text-xs text-fluent-neutral-60 mt-0.5">
            {filteredTasks.length} από {tasks.length} εργασίες
            {activeFilterCount > 0 && (
              <>
                {' · '}
                <button onClick={clearAllFilters} className="text-fluent-blue-600 hover:underline">
                  Καθαρισμός φίλτρων
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <FilterButton
            icon={<Person20Regular className="h-4 w-4" />}
            label="Ανάθεση"
            count={assigneeFilter.length}
            open={openFilter === 'assignees'}
            onToggle={() => setOpenFilter((v) => (v === 'assignees' ? null : 'assignees'))}
            onClose={() => setOpenFilter(null)}
          >
            {allAssignees.length === 0 ? (
              <div className="p-3 text-xs text-fluent-neutral-60">Καμία ανάθεση.</div>
            ) : (
              <div className="max-h-72 overflow-y-auto py-1">
                {allAssignees.map((u) => {
                  const active = assigneeFilter.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() =>
                        setAssigneeFilter((prev) =>
                          active ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                        )
                      }
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-fluent-neutral-6',
                        active && 'bg-fluent-blue-50',
                      )}
                    >
                      <Avatar user={{ name: u.name, avatarUrl: u.avatarUrl }} size="xs" />
                      <span className="flex-1 truncate">{u.name}</span>
                      {active && <span className="text-fluent-blue-600 text-xs">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {assigneeFilter.length > 0 && (
              <div className="border-t border-black/5 p-2">
                <button
                  onClick={() => setAssigneeFilter([])}
                  className="w-full text-xs text-fluent-blue-600 hover:underline py-1"
                >
                  Αφαίρεση όλων
                </button>
              </div>
            )}
          </FilterButton>

          <FilterButton
            icon={<Flag20Regular className="h-4 w-4" />}
            label="Προτεραιότητα"
            count={priorityFilter.length}
            open={openFilter === 'priority'}
            onToggle={() => setOpenFilter((v) => (v === 'priority' ? null : 'priority'))}
            onClose={() => setOpenFilter(null)}
          >
            <div className="py-1">
              {PRIORITY_OPTIONS.map((p) => {
                const active = priorityFilter.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() =>
                      setPriorityFilter((prev) =>
                        active ? prev.filter((v) => v !== p.value) : [...prev, p.value],
                      )
                    }
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-fluent-neutral-6',
                      active && 'bg-fluent-blue-50',
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    <span className="flex-1">{p.label}</span>
                    {active && <span className="text-fluent-blue-600 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          </FilterButton>

          <FilterButton
            icon={<Filter20Regular className="h-4 w-4" />}
            label="Περισσότερα"
            count={projectFilter.length + (onlyMine ? 1 : 0)}
            open={openFilter === 'more'}
            onToggle={() => setOpenFilter((v) => (v === 'more' ? null : 'more'))}
            onClose={() => setOpenFilter(null)}
          >
            <div className="p-2 border-b border-black/5">
              <label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded hover:bg-fluent-neutral-6">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                  className="h-4 w-4 accent-fluent-blue-500"
                />
                Μόνο οι δικές μου
              </label>
            </div>
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
              Έργα
            </div>
            <div className="max-h-60 overflow-y-auto pb-1">
              {projects.length === 0 ? (
                <div className="px-3 py-2 text-xs text-fluent-neutral-60">Κανένα έργο.</div>
              ) : (
                projects.map((p) => {
                  const active = projectFilter.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setProjectFilter((prev) =>
                          active ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                        )
                      }
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-fluent-neutral-6',
                        active && 'bg-fluent-blue-50',
                      )}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="flex-1 truncate">{p.name}</span>
                      {active && <span className="text-fluent-blue-600 text-xs">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          </FilterButton>

          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              aria-label="Καθαρισμός φίλτρων"
              className="h-9 w-9 rounded-md text-fluent-neutral-60 hover:bg-fluent-neutral-8 flex items-center justify-center"
              title="Καθαρισμός φίλτρων"
            >
              <Dismiss12Regular />
            </button>
          )}

          <div className="h-6 w-px bg-fluent-neutral-20 mx-1" />
          {headerUsers.length > 0 && <AvatarStack users={headerUsers} max={4} size="sm" />}
          {canCreate && (
            <Button variant="primary" size="md" icon={<Add16Filled />} onClick={() => setCreating(true)}>
              Προσθήκη εργασίας
            </Button>
          )}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex-1 overflow-x-auto overflow-y-hidden"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-5 p-6 lg:p-8 min-h-full min-w-max">
            {COLUMNS.map((col) => (
              <BoardColumn
                key={col.id}
                id={col.id}
                tasks={tasksByColumn[col.id]}
                accent={col.accent}
                canCreate={canCreate}
                onTaskClick={(t) => setSelectedTask(t)}
                onAddTask={(status) => setCreateStatus(status)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} isDragOverlay />}
          </DragOverlay>
        </DndContext>
      </motion.div>

      <TaskDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onEdit={(t) => {
          setSelectedTask(null);
          setEditing(t);
        }}
        onDelete={handleDeleteTask}
        onSendReminder={handleSendReminder}
      />

      <AnimatePresence>
        {(creating || createStatus) && (
          <BoardTaskModal
            mode="create"
            projects={projects}
            defaultStatus={createStatus ?? undefined}
            onClose={() => {
              setCreating(false);
              setCreateStatus(null);
              router.refresh();
            }}
          />
        )}
        {editing && (
          <BoardTaskModal
            mode="edit"
            projectId={editing.projectId}
            taskId={editing.id}
            members={editingProjectMembers}
            initial={{
              title: editing.title,
              description: editing.description ?? null,
              status: editing.status,
              priority: editing.priority,
              startDate: editing.startDate ?? null,
              dueDate: editing.dueDate ?? null,
              estimatedHours: editing.estimatedHours ?? null,
              assigneeIds: editing.assigneeIds,
            }}
            onClose={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>

      {resolutionPrompt && (
        <ResolutionDialog info={resolutionPrompt} onClose={() => setResolutionPrompt(null)} />
      )}
    </div>
  );
}

function FilterButton({
  icon,
  label,
  count,
  open,
  onToggle,
  onClose,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border text-sm transition-colors',
          count > 0
            ? 'border-fluent-blue-500 text-fluent-blue-700'
            : 'border-fluent-neutral-20 text-fluent-neutral-80 hover:bg-fluent-neutral-6',
        )}
      >
        {icon}
        {label}
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-fluent-blue-600 text-white text-[10px] font-semibold">
            {count}
          </span>
        )}
        <ChevronDown16Regular />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 w-64 rounded-lg bg-white shadow-fluent-16 border border-black/5 z-50 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
