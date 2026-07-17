'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dismiss20Regular, Flag16Filled, Calendar16Regular, Person16Regular,
  Tag16Regular, Edit20Regular, Delete20Regular, Mail20Regular, Send20Filled,
  TicketDiagonal16Regular,
} from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { Badge, Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDate, statusLabel } from '@/lib/utils';
import { getTicketThreadForTask } from '@/app/(app)/tickets/followup-actions';
import { ThreadList, ClarificationBox } from '@/components/tickets/clarification-thread';
import type { TaskWithRelations } from '@/types';

interface Props {
  task: TaskWithRelations | null;
  onClose: () => void;
  onEdit?: (task: TaskWithRelations) => void;
  onDelete?: (task: TaskWithRelations) => Promise<void> | void;
  onSendReminder?: (task: TaskWithRelations, message: string) => Promise<{ ok: boolean; error?: string; sent?: number } | void>;
}

export function TaskDrawer({ task, onClose, onEdit, onDelete, onSendReminder }: Props) {
  return (
    <AnimatePresence>
      {task && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-fluent-64 z-50 flex flex-col"
          >
            <DrawerContent
              task={task}
              onClose={onClose}
              onEdit={onEdit}
              onDelete={onDelete}
              onSendReminder={onSendReminder}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

type DrawerContentProps = Omit<Props, 'task'> & { task: TaskWithRelations };

function DrawerContent({ task, onClose, onEdit, onDelete, onSendReminder }: DrawerContentProps) {
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');
  const [reminderFeedback, setReminderFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [deletePending, startDelete] = useTransition();
  const [reminderPending, startReminder] = useTransition();
  const [thread, setThread] = useState<Awaited<ReturnType<typeof getTicketThreadForTask>>>(null);

  useEffect(() => {
    let cancelled = false;
    setThread(null);
    getTicketThreadForTask(task.id)
      .then((t) => {
        if (!cancelled) setThread(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const overdue = task.dueDate && task.dueDate < new Date() && task.status !== 'done';
  const canSendReminder = Boolean(onSendReminder) && task.assignees.length > 0;

  function handleDelete() {
    if (!onDelete) return;
    if (!confirm(`Διαγραφή της εργασίας "${task.title}";`)) return;
    startDelete(async () => {
      await onDelete(task);
    });
  }

  function handleSendReminder() {
    if (!onSendReminder) return;
    setReminderFeedback(null);
    startReminder(async () => {
      const res = await onSendReminder(task, reminderMsg);
      if (res?.ok) {
        setReminderFeedback({ ok: true, text: `Στάλθηκε σε ${res.sent ?? task.assignees.length} παραλήπτες.` });
        setReminderMsg('');
        setTimeout(() => setReminderOpen(false), 1500);
      } else {
        setReminderFeedback({ ok: false, text: res?.error ?? 'Αποτυχία αποστολής.' });
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 border-b border-black/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: task.project.color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 truncate">
            {task.project.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              onClick={() => onEdit(task)}
              className="h-8 w-8 rounded-md hover:bg-fluent-neutral-6 flex items-center justify-center text-fluent-neutral-70"
              aria-label="Επεξεργασία"
              title="Επεξεργασία"
            >
              <Edit20Regular />
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deletePending}
              className="h-8 w-8 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-70 disabled:opacity-50"
              aria-label="Διαγραφή"
              title="Διαγραφή"
            >
              <Delete20Regular />
            </button>
          )}
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-6 flex items-center justify-center text-fluent-neutral-60"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 pb-4">
          <h1 className="font-display text-2xl font-semibold text-fluent-neutral-95 leading-tight mb-2">
            {task.title}
          </h1>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <Badge variant={task.status === 'done' ? 'green' : 'blue'}>{statusLabel(task.status)}</Badge>
            <Badge variant={task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'orange' : 'neutral'}>
              <Flag16Filled className="h-3 w-3" /> {task.priority}
            </Badge>
            {overdue && <Badge variant="red">Overdue</Badge>}
            {task.ticket && (
              <Link
                href={`/tickets/${task.ticket.id}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors"
                title="Άνοιγμα ticket"
              >
                <TicketDiagonal16Regular className="h-3.5 w-3.5" />
                {task.ticket.code}
              </Link>
            )}
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-y-3 text-sm mb-6">
            <span className="text-fluent-neutral-60 flex items-center gap-2">
              <Person16Regular /> Assignees
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {task.assignees.length === 0 ? (
                <span className="text-fluent-neutral-50">Χωρίς ανάθεση</span>
              ) : (
                <>
                  <AvatarStack users={task.assignees} max={4} size="sm" />
                  <span className="text-fluent-neutral-80">
                    {task.assignees.map((a) => a.name.split(' ')[0]).join(', ')}
                  </span>
                </>
              )}
            </div>

            <span className="text-fluent-neutral-60 flex items-center gap-2">
              <Calendar16Regular /> Προθεσμία
            </span>
            <span className={cn('text-fluent-neutral-80', overdue && 'text-fluent-accent-red font-semibold')}>
              {task.dueDate
                ? formatDate(task.dueDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                : 'Χωρίς προθεσμία'}
            </span>

            <span className="text-fluent-neutral-60 flex items-center gap-2">
              <Tag16Regular /> Ετικέτες
            </span>
            <div className="flex flex-wrap gap-1">
              {task.tags.map((t) => <Tag key={t}>{t}</Tag>)}
              {task.tags.length === 0 && <span className="text-fluent-neutral-50">Καμία</span>}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 mb-2">Περιγραφή</h3>
            <p className="text-sm text-fluent-neutral-80 leading-relaxed whitespace-pre-wrap">
              {task.description || <span className="text-fluent-neutral-50 italic">Χωρίς περιγραφή.</span>}
            </p>
          </div>

          {canSendReminder && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 flex items-center gap-1.5">
                  <Mail20Regular className="h-4 w-4" /> Υπενθύμιση με email
                </h3>
                {!reminderOpen && (
                  <Button variant="subtle" size="sm" onClick={() => setReminderOpen(true)}>
                    Σύνταξη υπενθύμισης
                  </Button>
                )}
              </div>
              {reminderOpen && (
                <div className="space-y-2 bg-fluent-neutral-4 rounded-lg p-3 border border-black/5">
                  <p className="text-xs text-fluent-neutral-70">
                    Αποστολή σε {task.assignees.length} παραλήπτη(ες):{' '}
                    <span className="font-medium">
                      {task.assignees.map((a) => a.name.split(' ')[0]).join(', ')}
                    </span>
                  </p>
                  <textarea
                    value={reminderMsg}
                    onChange={(e) => setReminderMsg(e.target.value)}
                    rows={3}
                    placeholder="Προαιρετικό μήνυμα…"
                    className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
                  />
                  {reminderFeedback && (
                    <div
                      className={cn(
                        'text-xs rounded px-2 py-1 border',
                        reminderFeedback.ok
                          ? 'bg-green-50 border-green-200 text-fluent-accent-green'
                          : 'bg-red-50 border-red-200 text-fluent-accent-red',
                      )}
                    >
                      {reminderFeedback.text}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReminderOpen(false);
                        setReminderFeedback(null);
                        setReminderMsg('');
                      }}
                      disabled={reminderPending}
                    >
                      Ακύρωση
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Send20Filled className="h-4 w-4" />}
                      onClick={handleSendReminder}
                      disabled={reminderPending}
                    >
                      {reminderPending ? 'Αποστολή…' : 'Αποστολή'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {thread && (
            <div className="mt-6 border-t border-black/5 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60">
                  💬 Επικοινωνία με πελάτη ({thread.code})
                </h3>
                <Link
                  href={`/tickets/${thread.ticketId}`}
                  className="text-xs font-medium text-fluent-blue-600 hover:underline"
                >
                  Άνοιγμα ticket
                </Link>
              </div>
              <div className="space-y-3">
                <ThreadList messages={thread.messages} />
                <ClarificationBox
                  ticketId={thread.ticketId}
                  disabled={['closed', 'rejected', 'merged'].includes(thread.status)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
