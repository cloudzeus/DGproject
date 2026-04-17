'use client';

import { useState, useMemo, useTransition } from 'react';
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
} from '@fluentui/react-icons';
import { BoardColumn } from '@/components/board/board-column';
import { TaskCard } from '@/components/board/task-card';
import { TaskDrawer } from '@/components/board/task-drawer';
import { Button } from '@/components/ui/button';
import { AvatarStack } from '@/components/ui/avatar';
import type { TaskStatus, TaskWithRelations } from '@/types';
import { updateTaskStatus, sendTaskReminder } from './actions';
import { deleteTask } from '@/app/(app)/projects/[id]/task-actions';
import { BoardTaskModal, type BoardProjectOption } from './board-task-modal';

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
}

export function BoardClient({ initialTasks, headerUsers, projects, canCreate }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskWithRelations | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const tasksByColumn = useMemo(() => {
    const map: Record<TaskStatus, TaskWithRelations[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const t of tasks) map[t.status].push(t);
    for (const k of Object.keys(map) as TaskStatus[]) {
      map[k].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  function persistStatus(taskId: string, status: TaskStatus) {
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, status);
      if (!res.ok) setTasks(initialTasks);
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
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fluent-neutral-95">Board</h1>
          <p className="text-xs text-fluent-neutral-60 mt-0.5">All tasks across your projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-fluent-neutral-20 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6">
            <Person20Regular className="h-4 w-4" /> Assignees <ChevronDown16Regular />
          </button>
          <button className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-fluent-neutral-20 text-sm text-fluent-neutral-80 hover:bg-fluent-neutral-6">
            <Flag20Regular className="h-4 w-4" /> Priority <ChevronDown16Regular />
          </button>
          <Button variant="secondary" size="md" icon={<Filter20Regular />}>More filters</Button>
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
                onTaskClick={(t) => setSelectedTask(t)}
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
        {creating && (
          <BoardTaskModal
            mode="create"
            projects={projects}
            onClose={() => {
              setCreating(false);
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
    </div>
  );
}
