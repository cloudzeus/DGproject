'use client';

/**
 * Η πλήρης φόρμα ενός αντικειμένου της πρότασης — δημιουργία και επεξεργασία.
 *
 * Αντικαθιστά την επιτόπου επεξεργασία στη γραμμή. Εκείνη ήταν συμπαγής αλλά
 * αόρατη: διάφανα πεδία που αποκαλύπτονταν μόνο στο focus μοιάζουν με σκέτο
 * κείμενο, οπότε ο χρήστης δεν ήξερε καν ότι μπορεί να επέμβει. Και δύο
 * πράγματα δεν χωρούσαν εκεί με τίποτα: η αλλαγή είδους, και τα πεδία των
 * απαιτήσεων.
 *
 * Modal, όπως κάθε άλλη φόρμα στην εφαρμογή.
 */

import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { addProposalItem, updateProposalItem } from './proposal-actions';
import type { ProposalItemView, ProposalMember } from './proposal-item-row';

export type ItemKind = 'step' | 'milestone' | 'requirement';

const KINDS: { value: ItemKind; label: string; hint: string }[] = [
  { value: 'step', label: 'Βήμα', hint: 'Δουλειά που πρέπει να γίνει. Γίνεται εργασία στο board.' },
  { value: 'milestone', label: 'Ορόσημο', hint: 'Παραδοτέο με ημερομηνία. Ο πελάτης το βλέπει στο χρονοδιάγραμμα.' },
  {
    value: 'requirement',
    label: 'Απαίτηση',
    hint: 'Το συμφωνημένο εύρος — κριτήριο αποδοχής, όχι δουλειά. Δεν γίνεται εργασία.',
  },
];

const CATEGORIES = ['λειτουργική', 'τεχνική', 'εμπορική'];

export function ProposalItemModal({
  analysisId,
  item,
  defaultKind,
  members,
  team,
  onClose,
  onSaved,
}: {
  analysisId: string;
  /** null = δημιουργία νέου. */
  item: ProposalItemView | null;
  /** Το είδος της ενότητας από την οποία ζητήθηκε η δημιουργία. */
  defaultKind: ItemKind;
  /** Τα μέλη του έργου — εμφανίζονται πρώτα στη λίστα αναδόχων. */
  members: ProposalMember[];
  /** Όλη η ομάδα. Ανάθεση εκτός έργου επιτρέπεται· στη μετατροπή προστίθεται ως μέλος. */
  team: ProposalMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const creating = item === null;

  const [kind, setKind] = useState<ItemKind>(item?.kind ?? defaultKind);
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [dueDate, setDueDate] = useState(item?.suggestedDueDate ?? '');
  const [hours, setHours] = useState(item?.estimatedHours?.toString() ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>(
    item?.priority ?? 'medium',
  );
  const [visibility, setVisibility] = useState(item?.visibility ?? 'shared');
  const [assigneeId, setAssigneeId] = useState(item?.assigneeId ?? '');
  const [category, setCategory] = useState(item?.requirementCategory ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isRequirement = kind === 'requirement';
  const memberIds = new Set(members.map((m) => m.id));
  const others = team.filter((t) => !memberIds.has(t.id));
  const assigneeOutsideProject = assigneeId !== '' && !memberIds.has(assigneeId);

  function submit() {
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setError('Ο τίτλος είναι πολύ σύντομος.');
      return;
    }
    const parsedHours = hours === '' ? null : Number(hours);
    if (parsedHours !== null && (!Number.isFinite(parsedHours) || parsedHours < 0)) {
      setError('Μη έγκυρες ώρες.');
      return;
    }

    const patch = {
      kind,
      title: trimmed,
      description: description.trim() || null,
      suggestedDueDate: isRequirement ? null : dueDate || null,
      estimatedHours: isRequirement ? null : parsedHours,
      priority: isRequirement ? null : (priority as ProposalItemView['priority']),
      visibility: visibility as 'shared' | 'internal',
      requirementCategory: isRequirement ? category || null : null,
      assigneeId: isRequirement ? null : assigneeId || null,
    };

    startTransition(async () => {
      const res = creating
        ? await addProposalItem(analysisId, { ...patch, kind, title: trimmed })
        : await updateProposalItem(item!.id, patch);

      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <Modal
      title={creating ? 'Νέο αντικείμενο' : 'Επεξεργασία'}
      description={
        creating
          ? 'Ό,τι προσθέσεις με το χέρι επιβιώνει και μιας νέας ανάλυσης.'
          : 'Οι αλλαγές ισχύουν για την εργασία που θα δημιουργηθεί.'
      }
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <Field label="Είδος">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={[
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  kind === k.value
                    ? 'border-fluent-blue-500 bg-fluent-blue-50 font-semibold text-fluent-blue-700'
                    : 'border-fluent-neutral-20 text-fluent-neutral-70 hover:bg-fluent-neutral-6',
                ].join(' ')}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-fluent-neutral-60">
            {KINDS.find((k) => k.value === kind)?.hint}
          </p>
        </Field>

        <Field label="Τίτλος">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-full rounded-md border border-fluent-neutral-20 px-3 text-sm outline-none focus:border-fluent-blue-500"
          />
        </Field>

        <Field label="Περιγραφή">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-md border border-fluent-neutral-20 px-3 py-2 text-sm leading-relaxed outline-none focus:border-fluent-blue-500"
          />
        </Field>

        {isRequirement ? (
          <Field label="Κατηγορία">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? '' : c)}
                  className={[
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    category === c
                      ? 'border-fluent-blue-500 bg-fluent-blue-50 font-semibold text-fluent-blue-700'
                      : 'border-fluent-neutral-20 text-fluent-neutral-70 hover:bg-fluent-neutral-6',
                  ].join(' ')}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Προθεσμία">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-fluent-neutral-20 px-2 text-sm outline-none focus:border-fluent-blue-500"
                />
                {!dueDate && item?.suggestedOffsetDays != null && (
                  <p className="mt-1 text-[11px] text-fluent-neutral-60">
                    Χωρίς ημερομηνία υπολογίζεται +{item.suggestedOffsetDays} μέρες από την
                    έναρξη του έργου.
                  </p>
                )}
              </Field>

              <Field label="Εκτίμηση ωρών">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="h-9 w-full rounded-md border border-fluent-neutral-20 px-2 text-sm outline-none focus:border-fluent-blue-500"
                />
              </Field>

              <Field label="Προτεραιότητα">
                <select
                  value={priority ?? 'medium'}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="h-9 w-full rounded-md border border-fluent-neutral-20 px-2 text-sm outline-none focus:border-fluent-blue-500"
                >
                  <option value="low">Χαμηλή</option>
                  <option value="medium">Μεσαία</option>
                  <option value="high">Υψηλή</option>
                  <option value="urgent">Επείγον</option>
                </select>
              </Field>
            </div>

            <Field label="Ανάδοχος">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="h-9 w-full rounded-md border border-fluent-neutral-20 px-2 text-sm outline-none focus:border-fluent-blue-500"
              >
                <option value="">— χωρίς ανάθεση —</option>
                {members.length > 0 && (
                  <optgroup label="Μέλη του έργου">
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Υπόλοιπη ομάδα">
                    {others.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {assigneeOutsideProject && (
                <p className="mt-1 text-[11px] text-fluent-neutral-60">
                  Δεν είναι μέλος του έργου — θα προστεθεί αυτόματα όταν δημιουργηθεί η
                  εργασία, αλλιώς δεν θα μπορεί να τη δει.
                </p>
              )}
            </Field>
          </>
        )}

        <Field label="Ορατότητα στον πελάτη">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'shared' | 'internal')}
            className="h-9 w-full rounded-md border border-fluent-neutral-20 px-2 text-sm outline-none focus:border-fluent-blue-500"
          >
            <option value="shared">Ορατή — ο πελάτης τη βλέπει στο portal</option>
            <option value="internal">Εσωτερική — μόνο η ομάδα</option>
          </select>
        </Field>

        {item?.sourceQuote && (
          <div>
            <p className="mb-1 text-xs font-medium text-fluent-neutral-70">
              Απόσπασμα από την πρόταση
            </p>
            <blockquote className="border-l-2 border-fluent-neutral-20 bg-fluent-neutral-4 px-3 py-2 text-xs italic leading-relaxed text-fluent-neutral-60">
              {item.sourceQuote}
            </blockquote>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-fluent-accent-red">{error}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-fluent-neutral-8 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Άκυρο
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Αποθήκευση…' : creating ? 'Προσθήκη' : 'Αποθήκευση'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-fluent-neutral-70">{label}</label>
      {children}
    </div>
  );
}
