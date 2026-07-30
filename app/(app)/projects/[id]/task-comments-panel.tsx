'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Comment20Regular, Send20Regular, Delete20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { addTaskComment, setCommentVisibility, deleteTaskComment } from './comment-actions';

export type TaskCommentInfo = {
  id: string;
  content: string;
  visibility: 'internal' | 'shared';
  createdAt: string;
  author: { id: string; name: string; email: string; avatarUrl?: string };
  authorIsCustomer: boolean;
};

const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Σχόλια εργασίας με ρητή επιλογή ορατότητας.
 *
 * Το checkbox «Ορατό στον πελάτη» είναι ξεκλείδωτο εξ ορισμού: ένα σχόλιο που
 * γράφεται βιαστικά μένει εσωτερικό. Το badge σε κάθε σχόλιο δείχνει πού
 * κατέληξε, ώστε να μη χρειάζεται κανείς να θυμάται τι πάτησε.
 */
export function TaskCommentsPanel({
  taskId,
  comments,
  currentUserId,
  canComment,
}: {
  taskId: string;
  comments: TaskCommentInfo[];
  currentUserId: string;
  canComment: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'Κάτι πήγε στραβά.');
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const sharedCount = comments.filter((c) => c.visibility === 'shared').length;

  return (
    <div className="pt-4 mt-4 border-t border-black/5">
      <div className="flex items-center gap-2 mb-3">
        <Comment20Regular className="h-5 w-5 text-fluent-neutral-60" />
        <h3 className="text-sm font-semibold text-fluent-neutral-90">Σχόλια</h3>
        <span className="text-xs font-medium text-fluent-neutral-60 px-1.5 py-0.5 rounded-full bg-fluent-neutral-8">
          {comments.length}
        </span>
        {sharedCount > 0 && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-fluent-blue-50 text-fluent-blue-700">
            {sharedCount} ορατά στον πελάτη
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {comments.length === 0 && (
        <p className="text-xs text-fluent-neutral-60 bg-fluent-neutral-4 rounded-lg px-3 py-2">
          Κανένα σχόλιο ακόμα.
        </p>
      )}

      <div className="space-y-3 max-h-80 overflow-y-auto">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar user={{ name: c.author.name || c.author.email, avatarUrl: c.author.avatarUrl }} size="xs" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-fluent-neutral-90">
                  {c.author.name || c.author.email}
                </span>
                {c.authorIsCustomer && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-fluent-blue-700">
                    πελάτης
                  </span>
                )}
                <span
                  className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                    c.visibility === 'shared'
                      ? 'bg-fluent-blue-50 text-fluent-blue-700'
                      : 'bg-fluent-neutral-8 text-fluent-neutral-60'
                  }`}
                  title={
                    c.visibility === 'shared'
                      ? 'Ορατό στον πελάτη στο portal'
                      : 'Μόνο για την ομάδα'
                  }
                >
                  {c.visibility === 'shared' ? 'κοινό' : 'εσωτερικό'}
                </span>
                <span className="text-[11px] text-fluent-neutral-50">
                  {fmt.format(new Date(c.createdAt))}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-fluent-neutral-80 whitespace-pre-wrap break-words">
                {c.content}
              </p>
              {c.author.id === currentUserId && (
                <div className="mt-1 flex items-center gap-3">
                  {!c.authorIsCustomer && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setCommentVisibility(c.id, c.visibility === 'shared' ? 'internal' : 'shared'),
                        )
                      }
                      className="text-[11px] text-fluent-blue-600 hover:underline disabled:opacity-40"
                    >
                      {c.visibility === 'shared' ? 'Κάνε εσωτερικό' : 'Κοινοποίησε στον πελάτη'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteTaskComment(c.id))}
                    className="inline-flex items-center gap-1 text-[11px] text-fluent-neutral-60 hover:text-red-600 disabled:opacity-40"
                  >
                    <Delete20Regular className="h-3.5 w-3.5" /> Διαγραφή
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {canComment && (
        <div className="mt-3 pt-3 border-t border-black/5 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Γράψε σχόλιο…"
            className="w-full px-3 py-2 rounded-lg border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-fluent-neutral-70 cursor-pointer">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              Ορατό στον πελάτη
            </label>
            <Button
              size="sm"
              variant="primary"
              icon={<Send20Regular />}
              disabled={pending || !content.trim()}
              onClick={() =>
                run(
                  () =>
                    addTaskComment({
                      taskId,
                      content,
                      visibility: shared ? 'shared' : 'internal',
                    }),
                  () => {
                    setContent('');
                    setShared(false);
                  },
                )
              }
            >
              Σχολίασε
            </Button>
          </div>
          <p className="text-[10px] text-fluent-neutral-60">
            Χωρίς το τσεκ, το σχόλιο είναι εσωτερικό και δεν εμφανίζεται στο portal πελατών.
          </p>
        </div>
      )}
    </div>
  );
}
