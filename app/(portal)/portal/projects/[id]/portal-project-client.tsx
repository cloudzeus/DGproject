'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown20Regular, Send20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  statusLabel: string;
  dueDate: string | null;
  assignees: { name: string; avatarUrl?: string }[];
  comments: Comment[];
  questions: Question[];
};

const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' });

export function PortalProjectClient({ tasks }: { tasks: PortalTask[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const pendingQuestions = tasks.reduce(
    (n, t) => n + t.questions.filter((q) => !q.answer).length,
    0,
  );

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2 gap-2">
        <h2 className="text-sm font-semibold text-fluent-neutral-90">Εργασίες</h2>
        {pendingQuestions > 0 && (
          <span className="text-xs text-fluent-blue-700">
            {pendingQuestions} {pendingQuestions === 1 ? 'ερώτηση περιμένει' : 'ερωτήσεις περιμένουν'} απάντηση
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-fluent-neutral-60">Καμία εργασία ακόμα.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const open = openId === t.id;
            const unanswered = t.questions.filter((q) => !q.answer).length;
            return (
              <div
                key={t.id}
                className="rounded-xl border border-fluent-neutral-20 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : t.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02]"
                >
                  <ChevronDown20Regular
                    className={`h-4 w-4 shrink-0 text-fluent-neutral-50 transition-transform ${open ? '' : '-rotate-90'}`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-fluent-neutral-90 truncate">
                      {t.title}
                    </span>
                    <span className="block text-xs text-fluent-neutral-60">
                      {t.statusLabel}
                      {t.dueDate && ` · ${fmt.format(new Date(t.dueDate))}`}
                    </span>
                  </span>
                  {unanswered > 0 && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-fluent-blue-50 text-fluent-blue-700">
                      {unanswered} {unanswered === 1 ? 'ερώτηση' : 'ερωτήσεις'}
                    </span>
                  )}
                  {t.comments.length > 0 && (
                    <span className="shrink-0 text-xs text-fluent-neutral-60">
                      {t.comments.length} σχόλια
                    </span>
                  )}
                  <span className="shrink-0 flex -space-x-1.5">
                    {t.assignees.slice(0, 3).map((a, i) => (
                      <Avatar key={i} user={{ name: a.name, avatarUrl: a.avatarUrl }} size="xs" />
                    ))}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-black/5 p-4 space-y-5">
                    {t.description && (
                      <p className="text-sm text-fluent-neutral-80 whitespace-pre-wrap">
                        {t.description}
                      </p>
                    )}
                    {t.questions.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50">
                          Ερωτήσεις
                        </p>
                        {t.questions.map((q) => (
                          <QuestionRow key={q.id} q={q} />
                        ))}
                      </div>
                    )}
                    <CommentsBlock taskId={t.id} comments={t.comments} />
                  </div>
                )}
              </div>
            );
          })}
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
    <div className="rounded-lg bg-fluent-neutral-4 p-3">
      <p className="text-xs text-fluent-neutral-60">
        {q.askedByName} · {fmt.format(new Date(q.createdAt))}
      </p>
      <p className="mt-1 text-sm text-fluent-neutral-90 whitespace-pre-wrap">{q.question}</p>

      {q.answer ? (
        <div className="mt-2 rounded-md bg-white p-2.5">
          <p className="text-[11px] font-semibold text-fluent-neutral-60">Η απάντησή σας</p>
          <p className="mt-0.5 text-sm text-fluent-neutral-80 whitespace-pre-wrap">{q.answer}</p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
            maxLength={5000}
            placeholder="Η απάντησή σας…"
            className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
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
            Απάντηση
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
      <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50">
        Συνομιλία
      </p>

      {comments.length === 0 && (
        <p className="text-xs text-fluent-neutral-60">Κανένα σχόλιο ακόμα.</p>
      )}

      {comments.map((c) => (
        <div key={c.id} className={`flex ${c.fromUs ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] rounded-lg p-3 ${c.fromUs ? 'bg-fluent-blue-50' : 'bg-fluent-neutral-4'}`}
          >
            <p className="text-xs font-semibold text-fluent-neutral-60">
              {c.fromUs ? 'Εσείς' : c.authorName}
            </p>
            <p className="mt-1 text-sm text-fluent-neutral-80 whitespace-pre-wrap break-words">
              {c.content}
            </p>
            <p className="mt-1 text-[11px] text-fluent-neutral-50">
              {fmt.format(new Date(c.createdAt))}
            </p>
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder="Γράψτε σχόλιο…"
        className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
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
        Σχολιάστε
      </Button>
    </div>
  );
}
