'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckmarkCircle20Regular, Dismiss16Regular, Search20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { setProjectApprover } from './actions';

type UserLite = { id: string; name: string; email: string; image: string | null };

type Props = {
  projectId: string;
  canEdit: boolean;
  approver: UserLite | null;
  allUsers: UserLite[];
};

export function ApproverSelector({ projectId, canEdit, approver, allUsers }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers.filter(
      (u) => q === '' || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [allUsers, query]);

  function assign(userId: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await setProjectApprover(projectId, userId);
      if (res && !res.ok && res.error) setError(res.error);
      else { setOpen(false); setQuery(''); }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="p-4 border-b border-black/5 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Υπεύθυνος έγκρισης (PM)</h2>
        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckmarkCircle20Regular />}
            onClick={() => { setOpen((v) => !v); setError(null); setQuery(''); }}
          >
            {approver ? 'Αλλαγή' : 'Ορισμός'}
          </Button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="px-4 py-3 flex items-center gap-3">
        {approver ? (
          <>
            <Avatar user={{ name: approver.name || approver.email, avatarUrl: approver.image ?? undefined }} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-fluent-neutral-90 truncate">{approver.name || approver.email}</div>
              <div className="text-xs text-fluent-neutral-60 truncate">{approver.email}</div>
            </div>
            {canEdit && (
              <button
                onClick={() => assign(null)}
                disabled={pending}
                className="h-7 w-7 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60 disabled:opacity-50"
                aria-label="Αφαίρεση υπεύθυνου"
              >
                <Dismiss16Regular className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <div className="text-sm text-fluent-neutral-60">Δεν έχει οριστεί υπεύθυνος έγκρισης.</div>
        )}
      </div>

      {open && canEdit && (
        <div className="p-4 space-y-3 bg-fluent-neutral-4 border-t border-black/5">
          <div className="relative">
            <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Αναζήτηση χρήστη…"
              className="w-full h-10 pl-10 pr-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border border-fluent-neutral-20 bg-white">
            {candidates.length === 0 ? (
              <div className="p-4 text-xs text-fluent-neutral-60 text-center">Κανένας χρήστης δεν ταιριάζει.</div>
            ) : (
              candidates.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={pending}
                  onClick={() => assign(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-fluent-neutral-4 border-b border-black/5 last:border-0 text-left disabled:opacity-50"
                >
                  <Avatar user={{ name: u.name || u.email, avatarUrl: u.image ?? undefined }} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fluent-neutral-90 truncate">{u.name || u.email}</div>
                    <div className="text-xs text-fluent-neutral-60 truncate">{u.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
