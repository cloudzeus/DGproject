'use client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dismiss20Regular, Flag16Filled, Calendar16Regular, Person16Regular,
  Tag16Regular, Comment16Regular, Attach16Regular, Send20Filled,
  Link16Regular, CalendarAdd20Regular, FolderOpen20Regular, ChatMultiple20Regular,
} from '@fluentui/react-icons';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Badge, Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mockComments, mockUsers, currentUser } from '@/lib/mock-data';
import { cn, formatRelative, formatDate, statusLabel } from '@/lib/utils';
import type { TaskWithRelations } from '@/types';

interface Props {
  task: TaskWithRelations | null;
  onClose: () => void;
}

export function TaskDrawer({ task, onClose }: Props) {
  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-fluent-64 z-50 flex flex-col"
          >
            <DrawerContent task={task} onClose={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerContent({ task, onClose }: { task: TaskWithRelations; onClose: () => void }) {
  const comments = mockComments.filter(c => c.taskId === task.id);
  const overdue = task.dueDate && task.dueDate < new Date() && task.status !== 'done';

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-black/5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: task.project.color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60">{task.project.name}</span>
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-fluent-neutral-6 flex items-center justify-center text-fluent-neutral-60">
          <Dismiss20Regular />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-4">
          <h1 className="font-display text-2xl font-semibold text-fluent-neutral-95 leading-tight mb-2">{task.title}</h1>
          <div className="flex items-center gap-2 mb-6">
            <Badge variant={task.status === 'done' ? 'green' : 'blue'}>{statusLabel(task.status)}</Badge>
            <Badge variant={task.priority === 'high' ? 'orange' : task.priority === 'urgent' ? 'red' : 'neutral'}>
              <Flag16Filled className="h-3 w-3" /> {task.priority}
            </Badge>
            {overdue && <Badge variant="red">Overdue</Badge>}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-[120px_1fr] gap-y-3 text-sm mb-6">
            <span className="text-fluent-neutral-60 flex items-center gap-2">
              <Person16Regular /> Assignees
            </span>
            <div className="flex items-center gap-2">
              <AvatarStack users={task.assignees} max={4} size="sm" />
              <span className="text-fluent-neutral-80">{task.assignees.map(a => a.name.split(' ')[0]).join(', ')}</span>
            </div>

            <span className="text-fluent-neutral-60 flex items-center gap-2">
              <Calendar16Regular /> Due date
            </span>
            <span className={cn('text-fluent-neutral-80', overdue && 'text-fluent-accent-red font-semibold')}>
              {task.dueDate ? formatDate(task.dueDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'No due date'}
            </span>

            <span className="text-fluent-neutral-60 flex items-center gap-2">
              <Tag16Regular /> Tags
            </span>
            <div className="flex flex-wrap gap-1">
              {task.tags.map(t => <Tag key={t}>{t}</Tag>)}
              {task.tags.length === 0 && <span className="text-fluent-neutral-50">None</span>}
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 mb-2">Description</h3>
            <p className="text-sm text-fluent-neutral-80 leading-relaxed whitespace-pre-wrap">
              {task.description || <span className="text-fluent-neutral-50 italic">No description yet. Click to add one.</span>}
            </p>
          </div>

          {/* O365 integrations */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 mb-2">Microsoft 365</h3>
            <div className="grid grid-cols-3 gap-2">
              <button className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-black/5 hover:border-fluent-blue-300 hover:bg-fluent-blue-50 transition-all group">
                <CalendarAdd20Regular className="text-[#0078D4]" />
                <span className="text-[11px] font-medium text-fluent-neutral-80">Add to Outlook</span>
              </button>
              <button className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-black/5 hover:border-fluent-blue-300 hover:bg-fluent-blue-50 transition-all">
                <FolderOpen20Regular className="text-[#0364B8]" />
                <span className="text-[11px] font-medium text-fluent-neutral-80">Attach from OneDrive</span>
              </button>
              <button className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-black/5 hover:border-fluent-blue-300 hover:bg-fluent-blue-50 transition-all">
                <ChatMultiple20Regular className="text-[#6264A7]" />
                <span className="text-[11px] font-medium text-fluent-neutral-80">Discuss in Teams</span>
              </button>
            </div>
          </div>

          {/* Attachments */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60">Attachments</h3>
              <button className="text-xs text-fluent-blue-600 hover:underline flex items-center gap-1">
                <Attach16Regular className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-black/5 hover:bg-fluent-neutral-4 transition-colors">
                <div className="h-8 w-8 rounded bg-[#185ABD] text-white flex items-center justify-center font-bold text-xs">W</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fluent-neutral-90 truncate">Campaign_Brief_v3.docx</p>
                  <p className="text-[11px] text-fluent-neutral-60">OneDrive · 2.4 MB</p>
                </div>
                <button className="text-fluent-neutral-60 hover:text-fluent-blue-600">
                  <Link16Regular />
                </button>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-black/5 hover:bg-fluent-neutral-4 transition-colors">
                <div className="h-8 w-8 rounded bg-[#C43E1C] text-white flex items-center justify-center font-bold text-xs">P</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fluent-neutral-90 truncate">Launch-Deck.pptx</p>
                  <p className="text-[11px] text-fluent-neutral-60">SharePoint · 8.1 MB</p>
                </div>
                <button className="text-fluent-neutral-60 hover:text-fluent-blue-600">
                  <Link16Regular />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="px-6 pb-4 border-t border-black/5 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 mb-3 flex items-center gap-2">
            <Comment16Regular /> Comments ({comments.length})
          </h3>
          <div className="space-y-4">
            {comments.map(c => {
              const author = mockUsers.find(u => u.id === c.authorId)!;
              return (
                <div key={c.id} className="flex gap-3">
                  <Avatar user={author} size="sm" />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold text-fluent-neutral-90">{author.name}</span>
                      <span className="text-[11px] text-fluent-neutral-50">{formatRelative(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-fluent-neutral-80 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Comment composer */}
      <div className="p-4 border-t border-black/5 bg-fluent-neutral-4">
        <div className="flex gap-2">
          <Avatar user={currentUser} size="sm" />
          <div className="flex-1 flex items-center gap-2 bg-white rounded-lg border border-fluent-neutral-20 focus-within:border-fluent-blue-500 transition-colors px-3 py-1.5">
            <input
              type="text"
              placeholder="Write a comment, @ to mention..."
              className="flex-1 bg-transparent text-sm placeholder:text-fluent-neutral-50 focus:outline-none"
            />
            <button className="text-fluent-blue-600 hover:bg-fluent-blue-50 p-1 rounded">
              <Send20Filled />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
