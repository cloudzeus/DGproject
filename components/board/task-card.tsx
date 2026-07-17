'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import {
  Flag16Filled, Comment16Regular, Attach16Regular, Calendar16Regular, TicketDiagonal16Regular,
} from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import type { TaskWithRelations } from '@/types';
import { cn, formatRelative } from '@/lib/utils';

const priorityDot = {
  urgent: 'text-fluent-accent-red',
  high:   'text-fluent-accent-orange',
  medium: 'text-fluent-blue-500',
  low:    'text-fluent-neutral-40',
};

export function TaskCard({ task, onClick, isDragOverlay }: { task: TaskWithRelations; onClick?: () => void; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue = task.dueDate && task.dueDate < new Date() && task.status !== 'done';

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      initial={!isDragOverlay ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border border-black/5 p-3.5 cursor-grab active:cursor-grabbing group',
        'hover:border-fluent-blue-300 hover:shadow-fluent-4 transition-all',
        isDragOverlay && 'shadow-fluent-16 rotate-2 scale-105 border-fluent-blue-400',
      )}
    >
      {/* Top row: project tag + priority */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: task.project.color }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-60 truncate">
            {task.project.name}
          </span>
        </div>
        <Flag16Filled className={cn('shrink-0 h-3.5 w-3.5', priorityDot[task.priority])} />
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-fluent-neutral-90 leading-snug mb-2 line-clamp-2">
        {task.title}
      </h4>

      {/* Ticket origin */}
      {task.ticket && (
        <span className="inline-flex items-center gap-1 mb-2 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-semibold tabular-nums">
          <TicketDiagonal16Regular className="h-3 w-3" />
          {task.ticket.code}
        </span>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.slice(0, 3).map(t => <Tag key={t}>{t}</Tag>)}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-black/5">
        <div className="flex items-center gap-3 text-[11px] text-fluent-neutral-60">
          {task.dueDate && (
            <span className={cn('flex items-center gap-1', overdue && 'text-fluent-accent-red font-semibold')}>
              <Calendar16Regular className="h-3.5 w-3.5" />
              {formatRelative(task.dueDate)}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <Comment16Regular className="h-3.5 w-3.5" />
              {task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="flex items-center gap-1">
              <Attach16Regular className="h-3.5 w-3.5" />
              {task.attachmentCount}
            </span>
          )}
        </div>
        <AvatarStack users={task.assignees} max={2} size="xs" />
      </div>
    </motion.div>
  );
}
