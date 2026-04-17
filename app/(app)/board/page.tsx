'use client';
import { useState, useMemo } from 'react';
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  DragStartEvent, DragOverEvent, DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import {
  Filter20Regular, Person20Regular, Flag20Regular, Add16Filled,
  ChevronDown16Regular,
} from '@fluentui/react-icons';
import { BoardColumn } from '@/components/board/board-column';
import { TaskCard } from '@/components/board/task-card';
import { TaskDrawer } from '@/components/board/task-drawer';
import { Button } from '@/components/ui/button';
import { AvatarStack } from '@/components/ui/avatar';
import { mockTasks, mockUsers, mockProjects, getTaskWithRelations } from '@/lib/mock-data';
import type { Task, TaskStatus, TaskWithRelations } from '@/types';

const columns: { id: TaskStatus; accent: string }[] = [
  { id: 'backlog',     accent: '#8A8A8A' },
  { id: 'todo',        accent: '#0078D4' },
  { id: 'in_progress', accent: '#D83B01' },
  { id: 'review',      accent: '#8764B8' },
  { id: 'done',        accent: '#107C10' },
];

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<TaskStatus, TaskWithRelations[]> = {
      backlog: [], todo: [], in_progress: [], review: [], done: [],
    };
    for (const t of tasks) {
      const withRelations: TaskWithRelations = {
        ...t,
        assignees: mockUsers.filter(u => t.assigneeIds.includes(u.id)),
        project: (() => {
          const p = mockProjects.find(pp => pp.id === t.projectId)!;
          return { id: p.id, name: p.name, color: p.color };
        })(),
        commentCount: 0,
        attachmentCount: t.attachmentIds.length,
      };
      map[t.status].push(withRelations);
    }
    for (const k of Object.keys(map) as TaskStatus[]) {
      map[k].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [tasks]);

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;
  const activeTaskWithRelations = activeTask ? getTaskWithRelations(activeTask) : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    // Dropping on a column (empty) — move to that column
    if (over.data.current?.type === 'column') {
      const newStatus = over.data.current.status as TaskStatus;
      if (activeTask.status !== newStatus) {
        setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: newStatus } : t));
      }
      return;
    }

    // Dropping on another task — swap statuses if different columns
    const overTask = tasks.find(t => t.id === overId);
    if (!overTask) return;
    if (activeTask.status !== overTask.status) {
      setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: overTask.status } : t));
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeTask = tasks.find(t => t.id === activeId);
    const overTask = tasks.find(t => t.id === overId);
    if (!activeTask) return;

    // Reorder within same column
    if (overTask && activeTask.status === overTask.status) {
      const columnTasks = tasks.filter(t => t.status === activeTask.status).sort((a, b) => a.order - b.order);
      const oldIndex = columnTasks.findIndex(t => t.id === activeId);
      const newIndex = columnTasks.findIndex(t => t.id === overId);
      const reordered = arrayMove(columnTasks, oldIndex, newIndex);
      setTasks(prev => prev.map(t => {
        const match = reordered.find(r => r.id === t.id);
        if (!match) return t;
        return { ...t, order: reordered.indexOf(match) };
      }));
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Board header */}
      <div className="flex items-center justify-between px-6 lg:px-8 py-4 bg-white/60 backdrop-blur border-b border-black/5">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fluent-neutral-95">Board</h1>
            <p className="text-xs text-fluent-neutral-60 mt-0.5">All tasks across your projects</p>
          </div>
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
          <AvatarStack users={mockUsers.slice(0, 4)} max={4} size="sm" />
          <Button variant="primary" size="md" icon={<Add16Filled />}>Add task</Button>
        </div>
      </div>

      {/* Columns — horizontal scroll */}
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
            {columns.map(col => (
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
            {activeTaskWithRelations && <TaskCard task={activeTaskWithRelations} isDragOverlay />}
          </DragOverlay>
        </DndContext>
      </motion.div>

      <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}
