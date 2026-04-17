'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Dismiss20Regular, PersonSwap20Regular } from '@fluentui/react-icons';
import { Gantt, type GanttTask, type GanttRow } from '@/components/gantt/gantt';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { rescheduleTask, reassignTask } from './actions';

type UserOption = { id: string; name: string; email: string; image: string | null };

type ProjectRow = {
  id: string;
  name: string;
  color: string;
  taskCount: number;
  tasks: GanttTask[];
};

type Props = {
  rows: ProjectRow[];
  users: UserOption[];
  canEdit: boolean;
};

export function GlobalTimeline({ rows, users, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<GanttTask | null>(null);
  const [filterUser, setFilterUser] = useState<string>('all');

  const filtered = rows.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: `${p.taskCount} εργασίες`,
    color: p.color,
    tasks:
      filterUser === 'all'
        ? p.tasks
        : p.tasks.filter((t) => t.assignees.some((a) => a.id === filterUser)),
  } satisfies GanttRow));

  const visible = filtered.filter((r) => r.tasks.length > 0);

  async function handleReschedule(taskId: string, startDate: Date, dueDate: Date) {
    await rescheduleTask(taskId, startDate, dueDate);
    router.refresh();
  }

  async function handleReassign(taskId: string, userId: string | null) {
    await reassignTask(taskId, userId);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-black/5 shadow-fluent-2 p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60">Φιλτράρισμα κατά χρήστη:</span>
        <button
          onClick={() => setFilterUser('all')}
          className={`text-xs h-8 px-3 rounded ${filterUser === 'all' ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-70 hover:bg-fluent-neutral-4'}`}
        >
          Όλοι
        </button>
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setFilterUser(u.id)}
            className={`inline-flex items-center gap-1.5 text-xs h-8 px-2 rounded ${filterUser === u.id ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-70 hover:bg-fluent-neutral-4'}`}
          >
            <Avatar user={{ name: u.name || u.email, avatarUrl: u.image ?? undefined }} size="xs" />
            <span className="truncate max-w-[120px]">{u.name || u.email}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-10 text-center text-sm text-fluent-neutral-60">
          Καμία εργασία με ημερομηνίες για αυτό το φίλτρο.
        </div>
      ) : (
        <Gantt
          rows={visible}
          canEdit={canEdit}
          onReschedule={handleReschedule}
          onClickTask={(t) => setEditing(t)}
        />
      )}

      <AnimatePresence>
        {editing && (
          <TaskQuickPanel
            task={editing}
            users={users}
            canEdit={canEdit}
            onClose={() => setEditing(null)}
            onReassign={async (userId) => {
              await handleReassign(editing.id, userId);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskQuickPanel({
  task,
  users,
  canEdit,
  onClose,
  onReassign,
}: {
  task: GanttTask;
  users: UserOption[];
  canEdit: boolean;
  onClose: () => void;
  onReassign: (userId: string | null) => Promise<void>;
}) {
  const current = task.assignees[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-xl shadow-fluent-16 w-full max-w-md"
      >
        <div className="flex items-start justify-between p-4 border-b border-black/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full" style={{ background: task.projectColor }} />
              <span className="text-[11px] text-fluent-neutral-60 truncate">{task.projectName}</span>
            </div>
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70 shrink-0"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-fluent-neutral-50 mb-1.5 flex items-center gap-1.5">
              <PersonSwap20Regular className="h-4 w-4" /> Ανάθεση σε
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onReassign(null)}
                disabled={!canEdit}
                className={`text-xs px-3 h-8 rounded-full border transition-all ${
                  !current
                    ? 'bg-fluent-neutral-10 text-fluent-neutral-80 border-fluent-neutral-20'
                    : 'border-fluent-neutral-20 text-fluent-neutral-70 hover:bg-fluent-neutral-4'
                }`}
              >
                Κανείς
              </button>
              {users.map((u) => {
                const selected = current?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => onReassign(u.id)}
                    disabled={!canEdit || selected}
                    className={`inline-flex items-center gap-1.5 text-xs px-2 h-8 rounded-full border transition-all ${
                      selected
                        ? 'bg-fluent-blue-600 text-white border-transparent'
                        : 'border-fluent-neutral-20 text-fluent-neutral-80 hover:bg-fluent-neutral-4'
                    }`}
                  >
                    <Avatar user={{ name: u.name || u.email, avatarUrl: u.image ?? undefined }} size="xs" />
                    <span className="truncate max-w-[140px]">{u.name || u.email}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-black/5">
            <a
              href={`/projects/${task.projectId}`}
              className="inline-flex items-center gap-1.5 text-sm text-fluent-blue-600 hover:text-fluent-blue-700 font-medium"
            >
              Άνοιγμα στο έργο →
            </a>
          </div>
        </div>

        <div className="p-3 border-t border-black/5 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Κλείσιμο</Button>
        </div>
      </motion.div>
    </div>
  );
}
