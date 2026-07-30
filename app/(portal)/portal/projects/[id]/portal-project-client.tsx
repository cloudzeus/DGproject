'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown16Regular,
  Send20Regular,
  ChatBubblesQuestion16Regular,
  Comment16Regular,
  CheckmarkCircle16Filled,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  PORTAL_TASK_STATES,
  TASK_STATE_META,
  toPortalState,
  type PortalTaskState,
} from '@/components/portal/task-status';
import { addPortalComment, answerPortalQuestion } from '../../actions';

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorAvatarUrl?: string;
  /** true = γράφτηκε από τον πελάτη (τον ίδιο ή συνάδελφό του). */
  fromUs: boolean;
};

type Question = {
  id: string;
  question: string;
  answer: string | null;
  createdAt: string;
  askedByName: string;
};

export type PortalTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  assignees: { name: string; avatarUrl?: string }[];
  comments: Comment[];
  questions: Question[];
};

const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' });
const fmtDay = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' });

type Filter = 'all' | 'needsYou' | PortalTaskState;

export function PortalProjectClient({ tasks }: { tasks: PortalTask[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const needsYouIds = useMemo(
    () => new Set(tasks.filter((t) => t.questions.some((q) => !q.answer)).map((t) => t.id)),
    [tasks],
  );

  const byState = useMemo(() => {
    const m = new Map<PortalTaskState, PortalTask[]>();
    for (const s of PORTAL_TASK_STATES) m.set(s, []);
    for (const t of tasks) m.get(toPortalState(t.status))!.push(t);
    return m;
  }, [tasks]);

  const visible = useMemo(() => {
    if (filter === 'all') return tasks;
    if (filter === 'needsYou') return tasks.filter((t) => needsYouIds.has(t.id));
    return tasks.filter((t) => toPortalState(t.status) === filter);
  }, [tasks, filter, needsYouIds]);

  // Ομαδοποίηση κατά κατάσταση, με τη ροή της δουλειάς ως σειρά. Οι εργασίες σε
  // εξέλιξη πρώτες: αυτό ρωτάει ο πελάτης όταν ανοίγει τη σελίδα.
  const groups = PORTAL_TASK_STATES.map((s) => ({
    state: s,
    tasks: visible.filter((t) => toPortalState(t.status) === s),
  }))
    .filter((g) => g.tasks.length > 0)
    .sort(
      (a, b) =>
        ['inProgress', 'inReview', 'notStarted', 'done'].indexOf(a.state) -
        ['inProgress', 'inReview', 'notStarted', 'done'].indexOf(b.state),
    );

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Όλες', count: tasks.length },
    ...(needsYouIds.size > 0
      ? [{ key: 'needsYou' as Filter, label: 'Χρειάζονται εσάς', count: needsYouIds.size }]
      : []),
    ...PORTAL_TASK_STATES.filter((s) => (byState.get(s)?.length ?? 0) > 0).map((s) => ({
      key: s as Filter,
      label: TASK_STATE_META[s].label,
      count: byState.get(s)!.length,
    })),
  ];

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
        <p className="text-sm font-medium text-fluent-neutral-80">Καμία εργασία ακόμα</p>
        <p className="mt-1 text-xs text-fluent-neutral-60">
          Μόλις η ομάδα προγραμματίσει τη δουλειά, θα τη δείτε εδώ.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Φίλτρα ─── */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                active
                  ? 'bg-fluent-neutral-90 text-white'
                  : 'bg-white text-fluent-neutral-70 ring-1 ring-fluent-neutral-10 hover:bg-fluent-neutral-4'
              }`}
            >
              {c.key !== 'all' && c.key !== 'needsYou' && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: TASK_STATE_META[c.key as PortalTaskState].color }}
                  aria-hidden
                />
              )}
              {c.label}
              <span className={`tabular-nums ${active ? 'text-white/70' : 'text-fluent-neutral-50'}`}>
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Ομάδες εργασιών ─── */}
      {groups.map((g) => (
        <section key={g.state}>
          <div className="mb-2 flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TASK_STATE_META[g.state].color }}
              aria-hidden
            />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-70">
              {TASK_STATE_META[g.state].label}
            </h2>
            <span className="text-xs tabular-nums text-fluent-neutral-50">{g.tasks.length}</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
            {g.tasks.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                state={g.state}
                open={openId === t.id}
                onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                first={i === 0}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  state,
  open,
  onToggle,
  first,
}: {
  task: PortalTask;
  state: PortalTaskState;
  open: boolean;
  onToggle: () => void;
  first: boolean;
}) {
  const unanswered = task.questions.filter((q) => !q.answer).length;

  return (
    <div className={first ? '' : 'border-t border-fluent-neutral-8'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-fluent-neutral-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fluent-blue-500"
      >
        <ChevronDown16Regular
          className={`h-4 w-4 shrink-0 text-fluent-neutral-40 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
        />

        {state === 'done' ? (
          <CheckmarkCircle16Filled className="h-4 w-4 shrink-0 text-[#107C10]" />
        ) : (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
            style={{ backgroundColor: TASK_STATE_META[state].color }}
            aria-hidden
          />
        )}

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${state === 'done' ? 'text-fluent-neutral-60' : 'font-medium text-fluent-neutral-90'}`}
          >
            {task.title}
          </span>
          {(task.dueDate || task.completedAt) && (
            <span className="block text-[11px] tabular-nums text-fluent-neutral-50">
              {task.completedAt
                ? `Ολοκληρώθηκε ${fmtDay.format(new Date(task.completedAt))}`
                : `Προθεσμία ${fmtDay.format(new Date(task.dueDate!))}`}
            </span>
          )}
        </span>

        {unanswered > 0 && (
          <span className="shrink-0 rounded-full bg-fluent-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fluent-blue-700">
            {unanswered} {unanswered === 1 ? 'ερώτηση' : 'ερωτήσεις'}
          </span>
        )}

        {task.comments.length > 0 && (
          <span className="hidden shrink-0 items-center gap-1 text-[11px] tabular-nums text-fluent-neutral-50 sm:inline-flex">
            <Comment16Regular className="h-3.5 w-3.5" />
            {task.comments.length}
          </span>
        )}

        <span className="hidden shrink-0 -space-x-1.5 sm:flex">
          {task.assignees.slice(0, 3).map((a, i) => (
            <Avatar key={i} user={{ name: a.name, avatarUrl: a.avatarUrl }} size="xs" />
          ))}
        </span>
      </button>

      {open && (
        <div className="animate-fade-in space-y-5 border-t border-fluent-neutral-8 bg-fluent-neutral-4/50 px-4 py-4 sm:px-6">
          {task.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fluent-neutral-80">
              {task.description}
            </p>
          )}

          {task.questions.length > 0 && (
            <div className="space-y-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                <ChatBubblesQuestion16Regular className="h-3.5 w-3.5" />
                Ερωτήσεις προς εσάς
              </p>
              {task.questions.map((q) => (
                <QuestionRow key={q.id} q={q} />
              ))}
            </div>
          )}

          <CommentsBlock taskId={task.id} comments={task.comments} />
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q }: { q: Question }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={`rounded-lg border p-3 ${q.answer ? 'border-fluent-neutral-10 bg-white' : 'border-fluent-blue-200 bg-fluent-blue-50/40'}`}
    >
      <p className="text-[11px] text-fluent-neutral-60">
        {q.askedByName} · {fmt.format(new Date(q.createdAt))}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-fluent-neutral-90">{q.question}</p>

      {q.answer ? (
        <div className="mt-2.5 rounded-md bg-fluent-neutral-4 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">
            Η απάντησή σας
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-fluent-neutral-80">{q.answer}</p>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          {error && <p className="text-xs text-fluent-accent-red">{error}</p>}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
            maxLength={5000}
            placeholder="Η απάντησή σας…"
            className="w-full rounded-md border border-fluent-neutral-20 bg-white px-3 py-2 text-sm transition-colors duration-150 focus:border-fluent-blue-500 focus:outline-none focus:ring-1 focus:ring-fluent-blue-500"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={pending || !answer.trim()}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await answerPortalQuestion(q.id, answer);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setAnswer('');
                router.refresh();
              })
            }
          >
            {pending ? 'Αποστολή…' : 'Απάντηση'}
          </Button>
        </div>
      )}
    </div>
  );
}

function CommentsBlock({ taskId, comments }: { taskId: string; comments: Comment[] }) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
        <Comment16Regular className="h-3.5 w-3.5" />
        Συνομιλία
      </p>

      {comments.length === 0 && (
        <p className="text-xs text-fluent-neutral-60">
          Κανένα σχόλιο ακόμα. Ρωτήστε ό,τι θέλετε για αυτή την εργασία.
        </p>
      )}

      {comments.map((c) => (
        <div key={c.id} className={`flex gap-2 ${c.fromUs ? 'justify-end' : 'justify-start'}`}>
          {!c.fromUs && (
            <Avatar user={{ name: c.authorName, avatarUrl: c.authorAvatarUrl }} size="xs" />
          )}
          <div
            className={`max-w-[85%] rounded-xl px-3 py-2 ${
              c.fromUs
                ? 'rounded-br-sm bg-fluent-blue-500 text-white'
                : 'rounded-bl-sm bg-white ring-1 ring-fluent-neutral-10'
            }`}
          >
            <p
              className={`text-[10px] font-semibold ${c.fromUs ? 'text-white/70' : 'text-fluent-neutral-60'}`}
            >
              {c.fromUs ? 'Εσείς' : c.authorName}
            </p>
            <p
              className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${c.fromUs ? 'text-white' : 'text-fluent-neutral-80'}`}
            >
              {c.content}
            </p>
            <p
              className={`mt-1 text-[10px] tabular-nums ${c.fromUs ? 'text-white/60' : 'text-fluent-neutral-50'}`}
            >
              {fmt.format(new Date(c.createdAt))}
            </p>
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-fluent-accent-red">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="Γράψτε σχόλιο…"
          className="flex-1 rounded-md border border-fluent-neutral-20 bg-white px-3 py-2 text-sm transition-colors duration-150 focus:border-fluent-blue-500 focus:outline-none focus:ring-1 focus:ring-fluent-blue-500"
        />
        <Button
          size="sm"
          variant="primary"
          icon={<Send20Regular />}
          disabled={pending || !content.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await addPortalComment(taskId, content);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setContent('');
              router.refresh();
            })
          }
        >
          <span className="sr-only sm:not-sr-only">Αποστολή</span>
        </Button>
      </div>
    </div>
  );
}
