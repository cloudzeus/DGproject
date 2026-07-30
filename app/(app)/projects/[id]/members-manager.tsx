'use client';

import { useMemo, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PersonAdd20Regular, Dismiss16Regular, Search20Regular, Edit16Regular, Eye16Regular, EyeOff16Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { addProjectMember, removeProjectMember, updateProjectMemberProfile } from './actions';

type MemberUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  /** Ιδιότητα σε ΑΥΤΟ το έργο. */
  title?: string | null;
  responsibilities?: string | null;
  visibleToCustomer?: boolean;
  /** Ανήκουν στον χρήστη — αλλαγή φαίνεται σε κάθε έργο. */
  phone?: string | null;
  mobile?: string | null;
};

type Props = {
  projectId: string;
  canEdit: boolean;
  ownerId: string;
  members: MemberUser[];
  allUsers: MemberUser[];
  /** Το έργο έχει πελάτη; Ελέγχει αν φαίνεται ο διακόπτης ορατότητας. */
  projectHasCustomer?: boolean;
};

export function MembersManager({ projectId, canEdit, ownerId, members, allUsers, projectHasCustomer = false }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
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
            <div key={m.id}>
              <div className="px-4 py-3 flex items-center gap-3">
                <Avatar user={{ name: m.name || m.email, avatarUrl: m.image ?? undefined }} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fluent-neutral-90 truncate">
                    {m.name || m.email}
                    {m.title && (
                      <span className="ml-2 text-xs font-normal text-fluent-neutral-70">· {m.title}</span>
                    )}
                  </div>
                  <div className="text-xs text-fluent-neutral-60 truncate">
                    {[m.email, m.phone, m.mobile].filter(Boolean).join(' · ')}
                  </div>
                  {m.responsibilities && (
                    <div className="mt-0.5 text-[11px] text-fluent-neutral-60 line-clamp-1">
                      {m.responsibilities}
                    </div>
                  )}
                </div>

                {projectHasCustomer && m.visibleToCustomer === false && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-60 bg-fluent-neutral-8 px-2 py-0.5 rounded"
                    title="Δεν εμφανίζεται στο portal πελατών"
                  >
                    <EyeOff16Regular className="h-3 w-3" /> κρυφό
                  </span>
                )}

                {isOwner && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fluent-blue-700 bg-fluent-blue-50 px-2 py-0.5 rounded">
                    Ιδιοκτήτης
                  </span>
                )}

                {canEdit && (
                  <button
                    onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                    className="h-7 w-7 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
                    aria-label="Επεξεργασία ιδιότητας"
                    title="Ιδιότητα, αρμοδιότητες, τηλέφωνα"
                  >
                    <Edit16Regular className="h-4 w-4" />
                  </button>
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

              {canEdit && editingId === m.id && (
                <MemberProfileForm
                  projectId={projectId}
                  member={m}
                  projectHasCustomer={projectHasCustomer}
                  onDone={() => setEditingId(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Φόρμα ιδιότητας μέλους.
 *
 * Τα δύο πάνω πεδία ζουν στη σχέση μέλους–έργου· τα τηλέφωνα ζουν στον χρήστη.
 * Η διάκριση γράφεται ρητά στη φόρμα, γιατί αλλιώς κάποιος θα άλλαζε τηλέφωνο
 * νομίζοντας ότι το κάνει «για αυτό το έργο».
 */
function MemberProfileForm({
  projectId,
  member,
  projectHasCustomer,
  onDone,
}: {
  projectId: string;
  member: MemberUser;
  projectHasCustomer: boolean;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(member.title ?? '');
  const [responsibilities, setResponsibilities] = useState(member.responsibilities ?? '');
  const [visible, setVisible] = useState(member.visibleToCustomer ?? true);
  const [phone, setPhone] = useState(member.phone ?? '');
  const [mobile, setMobile] = useState(member.mobile ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  return (
    <div className="border-t border-black/5 bg-fluent-neutral-4 px-4 py-4 space-y-3">
      {error && <p className="text-xs text-fluent-accent-red">{error}</p>}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
          Σε αυτό το έργο
        </p>
        <div className="mt-1.5 space-y-2.5">
          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Ιδιότητα</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="π.χ. Υπεύθυνος εγκατάστασης"
              className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">
              Αρμοδιότητες
            </label>
            <textarea
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Τι αναλαμβάνει, ώστε ο πελάτης να ξέρει σε ποιον να απευθυνθεί"
              className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
          Στοιχεία επικοινωνίας
        </p>
        <p className="text-[10px] text-fluent-neutral-60">
          Ανήκουν στον χρήστη — η αλλαγή φαίνεται σε κάθε έργο.
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Τηλέφωνο</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={200}
              inputMode="tel"
              className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Κινητό</label>
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              maxLength={200}
              inputMode="tel"
              className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {projectHasCustomer && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-fluent-neutral-90">
              {visible ? <Eye16Regular className="h-3.5 w-3.5" /> : <EyeOff16Regular className="h-3.5 w-3.5" />}
              Ορατό στον πελάτη
            </span>
            <span className="block text-[10px] text-fluent-neutral-60">
              Εμφανίζεται στην ομάδα του έργου στο portal, με ιδιότητα και στοιχεία επικοινωνίας.
            </span>
          </span>
        </label>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="primary"
          disabled={saving}
          onClick={() =>
            startSave(async () => {
              setError(null);
              const res = await updateProjectMemberProfile(projectId, member.id, {
                title,
                responsibilities,
                visibleToCustomer: visible,
                phone,
                mobile,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              onDone();
            })
          }
        >
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Άκυρο
        </Button>
      </div>
    </div>
  );
}
