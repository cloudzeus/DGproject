'use client';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Add16Regular, MoreHorizontal20Regular } from '@fluentui/react-icons';
import { TaskCard } from './task-card';
import type { TaskWithRelations, TaskStatus } from '@/types';
import { cn, statusLabel } from '@/lib/utils';

interface Props {
  id: TaskStatus;
  tasks: TaskWithRelations[];
  accent: string;
  onTaskClick?: (t: TaskWithRelations) => void;
}

export function BoardColumn({ id, tasks, accent, onTaskClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'column', status: id } });

  return (
    <div className="flex flex-col w-[320px] shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
          <h3 className="text-sm font-semibold text-fluent-neutral-90">{statusLabel(id)}</h3>
          <span className="text-xs text-fluent-neutral-50 font-medium px-1.5 py-0.5 bg-fluent-neutral-8 rounded">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="h-7 w-7 rounded-md flex items-center justify-center text-fluent-neutral-60 hover:bg-black/5 transition-colors">
            <Add16Regular />
          </button>
          <button className="h-7 w-7 rounded-md flex items-center justify-center text-fluent-neutral-60 hover:bg-black/5 transition-colors">
            <MoreHorizontal20Regular />
          </button>
        </div>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-[200px] rounded-xl p-2 space-y-2 transition-all',
          isOver ? 'bg-fluent-blue-50 ring-2 ring-fluent-blue-300 ring-inset' : 'bg-black/[0.02]',
        )}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(t => (
            <TaskCard key={t.id} task={t} onClick={() => onTaskClick?.(t)} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-fluent-neutral-50 border-2 border-dashed border-fluent-neutral-20 rounded-lg">
            Drop tasks here
          </div>
        )}

        <button className="w-full flex items-center gap-2 px-3 h-9 rounded-lg text-sm text-fluent-neutral-60 hover:bg-white hover:text-fluent-blue-600 hover:border hover:border-fluent-blue-300 transition-all">
          <Add16Regular /> Add task
        </button>
      </div>
    </div>
  );
}
