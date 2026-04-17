'use client';

import { useMemo, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PersonAdd20Regular, Dismiss16Regular, Search20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { addProjectMember, removeProjectMember } from './actions';

type MemberUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

type Props = {
  projectId: string;
  canEdit: boolean;
  ownerId: string;
  members: MemberUser[];
  allUsers: MemberUser[];
};

export function MembersManager({ projectId, canEdit, ownerId, members, allUsers }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers.filter(
      (u) =>
        !memberIds.has(u.id) &&
        (q === '' || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }, [allUsers, memberIds, query]);

  function handleAdd(userId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addProjectMember(projectId, userId);
      if (res && !res.ok && res.error) setError(res.error);
    });
  }

  function handleRemove(userId: string) {
    if (userId === ownerId) {
      setError('Δεν μπορείτε να αφαιρέσετε τον ιδιοκτήτη.');
      return;
    }
    if (!confirm('Να αφαιρεθεί το μέλος;')) return;
    setError(null);
    startTransition(async () => {
      await removeProjectMember(projectId, userId);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="p-4 border-b border-black/5 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Μέλη ({members.length})</h2>
        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            icon={<PersonAdd20Regular />}
            onClick={() => { setOpen((v) => !v); setError(null); setQuery(''); }}
          >
            Προσθήκη
          </Button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <AnimatePresence>
        {open && canEdit && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-black/5 overflow-hidden"
          >
            <div className="p-4 space-y-3 bg-fluent-neutral-4">
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
                      onClick={() => handleAdd(u.id)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-fluent-neutral-4 border-b border-black/5 last:border-0 text-left disabled:opacity-50"
                    >
                      <Avatar user={{ name: u.name || u.email, avatarUrl: u.image ?? undefined }} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-fluent-neutral-90 truncate">{u.name || u.email}</div>
                        <div className="text-xs text-fluent-neutral-60 truncate">{u.email}</div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-fluent-neutral-50">{u.role}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="divide-y divide-black/5">
        {members.length === 0 && (
          <div className="p-6 text-center text-sm text-fluent-neutral-60">Δεν υπάρχουν ακόμη μέλη.</div>
        )}
        {members.map((m) => {
          const isOwner = m.id === ownerId;
          return (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3">
              <Avatar user={{ name: m.name || m.email, avatarUrl: m.image ?? undefined }} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-fluent-neutral-90 truncate">{m.name || m.email}</div>
                <div className="text-xs text-fluent-neutral-60 truncate">{m.email}</div>
              </div>
              {isOwner && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fluent-blue-700 bg-fluent-blue-50 px-2 py-0.5 rounded">
                  Ιδιοκτήτης
                </span>
              )}
              {canEdit && !isOwner && (
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={pending}
                  className="h-7 w-7 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60 disabled:opacity-50"
                  aria-label="Αφαίρεση"
                >
                  <Dismiss16Regular className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
