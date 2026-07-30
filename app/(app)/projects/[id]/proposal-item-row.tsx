'use client';

/**
 * Μια γραμμή προσχεδίου, επεξεργάσιμη επιτόπου.
 *
 * Η αποθήκευση γίνεται στο blur, όχι με κουμπί «αποθήκευση» ανά γραμμή: σε μια
 * λίστα είκοσι αντικειμένων, είκοσι κουμπιά είναι θόρυβος. Η τοπική κατάσταση
 * κρατά ό,τι γράφει ο χρήστης ώστε το πεδίο να μην «αναπηδά» όσο τρέχει το
 * action.
 *
 * Το απόσπασμα προέλευσης είναι διπλωμένο αλλά πάντα προσβάσιμο. Είναι ο μόνος
 * τρόπος να απαντηθεί «πού το βρήκε αυτό;» — και μια χαμηλή βεβαιότητα χωρίς
 * απόσπασμα να ελεγχθεί είναι απλώς ένα πορτοκαλί σήμα που κανείς δεν εμπιστεύεται.
 */

import { useState, useTransition } from 'react';
import {
  ChevronDown16Regular,
  ChevronRight16Regular,
  Dismiss16Regular,
  ArrowUndo16Regular,
  Warning16Regular,
  CheckmarkCircle16Filled,
  Eye16Regular,
  EyeOff16Regular,
  Person16Regular,
  ArrowSync16Regular,
} from '@fluentui/react-icons';
import {
  updateProposalItem,
  setProposalItemRejected,
  regenerateProposalItemWithClarification,
} from './proposal-actions';

export type ProposalMember = { id: string; name: string; email: string };

export type ProposalItemView = {
  id: string;
  kind: 'step' | 'milestone' | 'requirement';
  title: string;
  description: string | null;
  suggestedDueDate: string | null;
  suggestedOffsetDays: number | null;
  estimatedHours: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  visibility: 'shared' | 'internal';
  requirementCategory: string | null;
  sourceQuote: string | null;
  confidence: number | null;
  manual: boolean;
  assigneeId: string | null;
  clarification: string | null;
  regeneratedFromId: string | null;
  status: 'draft' | 'rejected' | 'converted' | 'replaced';
};

/** Κάτω από αυτό, ο άνθρωπος πρέπει να κοιτάξει πριν το εμπιστευτεί. */
const LOW_CONFIDENCE = 0.6;

export function ProposalItemRow({
  item,
  members,
  selected,
  onToggle,
  onChanged,
}: {
  item: ProposalItemView;
  members: ProposalMember[];
  selected: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [dueDate, setDueDate] = useState(item.suggestedDueDate ?? '');
  const [hours, setHours] = useState(item.estimatedHours?.toString() ?? '');
  const [showQuote, setShowQuote] = useState(false);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarification, setClarification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const converted = item.status === 'converted';
  const rejected = item.status === 'rejected';
  const lowConfidence = !item.manual && (item.confidence ?? 1) < LOW_CONFIDENCE;
  const locked = converted || rejected || pending;

  function save(patch: Parameters<typeof updateProposalItem>[1]) {
    startTransition(async () => {
      const res = await updateProposalItem(item.id, patch);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        onChanged();
      }
    });
  }

  function toggleRejected() {
    startTransition(async () => {
      const res = await setProposalItemRejected(item.id, !rejected);
      if (!res.ok) setError(res.error);
      else onChanged();
    });
  }

  function regenerate() {
    const text = clarification.trim();
    if (text.length < 5) {
      setError('Γράψε λίγο πιο αναλυτικά τι θέλεις να αλλάξει.');
      return;
    }
    startTransition(async () => {
      const res = await regenerateProposalItemWithClarification(item.id, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setClarifyOpen(false);
      setClarification('');
      onChanged();
    });
  }

  return (
    <div
      className={[
        'rounded-lg border px-3 py-2.5 transition-colors',
        rejected
          ? 'border-fluent-neutral-10 bg-fluent-neutral-4 opacity-60'
          : converted
            ? 'border-fluent-accent-green/30 bg-green-50/40'
            : selected
              ? 'border-fluent-blue-300 bg-fluent-blue-50'
              : 'border-fluent-neutral-10 bg-white hover:border-fluent-neutral-20',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        {converted ? (
          <span
            className="mt-1 shrink-0 text-fluent-accent-green"
            title="Έγινε ήδη εργασία"
          >
            <CheckmarkCircle16Filled />
          </span>
        ) : (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={rejected}
            className="mt-1 h-4 w-4 shrink-0 rounded border-fluent-neutral-30 text-fluent-blue-500 focus:ring-fluent-blue-500 disabled:opacity-40"
            aria-label={`Επιλογή: ${item.title}`}
          />
        )}

        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== item.title && save({ title })}
            disabled={locked}
            className="w-full bg-transparent text-sm font-semibold text-fluent-neutral-90 outline-none focus:rounded focus:bg-fluent-neutral-6 focus:px-1 disabled:cursor-default"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() =>
              description !== (item.description ?? '') && save({ description })
            }
            disabled={locked}
            rows={description.length > 90 ? 3 : 1}
            placeholder="Περιγραφή…"
            className="mt-1 w-full resize-none bg-transparent text-xs leading-relaxed text-fluent-neutral-60 outline-none focus:rounded focus:bg-fluent-neutral-6 focus:px-1 disabled:cursor-default"
          />

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            {item.kind !== 'requirement' && (
              <>
                <label className="flex items-center gap-1 text-fluent-neutral-50">
                  <span>Προθεσμία</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    onBlur={() =>
                      dueDate !== (item.suggestedDueDate ?? '') &&
                      save({ suggestedDueDate: dueDate || null })
                    }
                    disabled={locked}
                    className="rounded border border-fluent-neutral-20 px-1.5 py-0.5 text-fluent-neutral-80 outline-none focus:border-fluent-blue-500"
                  />
                </label>

                {item.suggestedOffsetDays != null && !item.suggestedDueDate && (
                  <span
                    className="rounded bg-fluent-neutral-8 px-1.5 py-0.5 text-fluent-neutral-60"
                    title="Η πρόταση δίνει διάστημα, όχι ημερομηνία — υπολογίζεται από την έναρξη του έργου"
                  >
                    +{item.suggestedOffsetDays} μέρες
                  </span>
                )}

                <label className="flex items-center gap-1 text-fluent-neutral-50">
                  <span>Ώρες</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    onBlur={() => {
                      const next = hours === '' ? null : Number(hours);
                      if (next !== item.estimatedHours) save({ estimatedHours: next });
                    }}
                    disabled={locked}
                    className="w-16 rounded border border-fluent-neutral-20 px-1.5 py-0.5 text-fluent-neutral-80 outline-none focus:border-fluent-blue-500"
                  />
                </label>

                <select
                  value={item.priority ?? 'medium'}
                  onChange={(e) =>
                    save({ priority: e.target.value as ProposalItemView['priority'] })
                  }
                  disabled={locked}
                  className="rounded border border-fluent-neutral-20 px-1.5 py-0.5 text-fluent-neutral-80 outline-none focus:border-fluent-blue-500"
                >
                  <option value="low">Χαμηλή</option>
                  <option value="medium">Μεσαία</option>
                  <option value="high">Υψηλή</option>
                  <option value="urgent">Επείγον</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    save({ visibility: item.visibility === 'shared' ? 'internal' : 'shared' })
                  }
                  disabled={locked}
                  className="flex items-center gap-1 rounded border border-fluent-neutral-20 px-1.5 py-0.5 text-fluent-neutral-60 hover:bg-fluent-neutral-6 disabled:opacity-50"
                  title={
                    item.visibility === 'shared'
                      ? 'Ο πελάτης θα βλέπει αυτή την εργασία'
                      : 'Εσωτερική — ο πελάτης δεν τη βλέπει'
                  }
                >
                  {item.visibility === 'shared' ? <Eye16Regular /> : <EyeOff16Regular />}
                  {item.visibility === 'shared' ? 'Ορατή' : 'Εσωτερική'}
                </button>

                <label className="flex items-center gap-1 text-fluent-neutral-50">
                  <Person16Regular />
                  <select
                    value={item.assigneeId ?? ''}
                    onChange={(e) => save({ assigneeId: e.target.value || null })}
                    disabled={locked}
                    className="max-w-[140px] rounded border border-fluent-neutral-20 px-1.5 py-0.5 text-fluent-neutral-80 outline-none focus:border-fluent-blue-500"
                    title="Ποιος θα αναλάβει την εργασία"
                  >
                    <option value="">— χωρίς ανάθεση —</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {item.kind === 'requirement' && item.requirementCategory && (
              <span className="rounded bg-fluent-neutral-8 px-1.5 py-0.5 text-fluent-neutral-60">
                {item.requirementCategory}
              </span>
            )}

            {lowConfidence && (
              <span
                className="flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 font-medium text-fluent-accent-orange"
                title="Το μοντέλο δεν ήταν σίγουρο — έλεγξε το απόσπασμα"
              >
                <Warning16Regular />
                {Math.round((item.confidence ?? 0) * 100)}%
              </span>
            )}

            {item.manual && (
              <span className="rounded bg-fluent-neutral-8 px-1.5 py-0.5 text-fluent-neutral-60">
                χειροκίνητο
              </span>
            )}

            {item.regeneratedFromId && (
              <span
                className="rounded bg-fluent-blue-50 px-1.5 py-0.5 text-fluent-blue-700"
                title={item.clarification ? `Διευκρίνιση: ${item.clarification}` : undefined}
              >
                από διευκρίνιση
              </span>
            )}

            {!converted && !rejected && (
              <button
                type="button"
                onClick={() => setClarifyOpen((v) => !v)}
                className="flex items-center gap-0.5 text-fluent-blue-600 hover:underline"
                title="Πες τι δεν κατάλαβε σωστά και ξαναφτιάξ' το"
              >
                <ArrowSync16Regular />
                διευκρινίσεις
              </button>
            )}

            {item.sourceQuote && (
              <button
                type="button"
                onClick={() => setShowQuote((v) => !v)}
                className="flex items-center gap-0.5 text-fluent-blue-600 hover:underline"
              >
                {showQuote ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                απόσπασμα
              </button>
            )}
          </div>

          {clarifyOpen && (
            <div className="mt-2 space-y-1.5 rounded-md border border-fluent-blue-200 bg-fluent-blue-50 p-2">
              <textarea
                autoFocus
                value={clarification}
                onChange={(e) => setClarification(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setClarifyOpen(false);
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) regenerate();
                }}
                rows={2}
                placeholder="π.χ. «αυτό είναι τρία ξεχωριστά βήματα: μελέτη, καλωδίωση, παραμετροποίηση» ή «εννοεί τον δικό μας εξοπλισμό, όχι του πελάτη»"
                className="w-full resize-none rounded border border-fluent-neutral-20 bg-white px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-fluent-blue-500"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-fluent-neutral-60">
                  Μπορεί να προκύψουν περισσότερα από ένα βήματα.
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setClarifyOpen(false)}
                    className="rounded px-2 py-1 text-[11px] text-fluent-neutral-60 hover:bg-white"
                  >
                    Άκυρο
                  </button>
                  <button
                    type="button"
                    onClick={regenerate}
                    disabled={pending || clarification.trim().length < 5}
                    className="rounded bg-fluent-blue-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-fluent-blue-600 disabled:opacity-50"
                  >
                    {pending ? 'Ξαναφτιάχνεται…' : 'Ξαναφτιάξ’ το'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showQuote && item.sourceQuote && (
            <blockquote className="mt-2 border-l-2 border-fluent-neutral-20 bg-fluent-neutral-4 px-2.5 py-1.5 text-[11px] italic leading-relaxed text-fluent-neutral-60">
              {item.sourceQuote}
            </blockquote>
          )}

          {error && <p className="mt-1 text-[11px] text-fluent-accent-red">{error}</p>}
        </div>

        {!converted && (
          <button
            type="button"
            onClick={toggleRejected}
            disabled={pending}
            className="mt-0.5 shrink-0 rounded p-1 text-fluent-neutral-40 transition-colors hover:bg-fluent-neutral-8 hover:text-fluent-neutral-70"
            title={rejected ? 'Επαναφορά' : 'Απόρριψη'}
            aria-label={rejected ? 'Επαναφορά' : 'Απόρριψη'}
          >
            {rejected ? <ArrowUndo16Regular /> : <Dismiss16Regular />}
          </button>
        )}
      </div>
    </div>
  );
}
