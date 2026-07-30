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
} from '@fluentui/react-icons';
import { updateProposalItem, setProposalItemRejected } from './proposal-actions';

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
  status: 'draft' | 'rejected' | 'converted';
};

/** Κάτω από αυτό, ο άνθρωπος πρέπει να κοιτάξει πριν το εμπιστευτεί. */
const LOW_CONFIDENCE = 0.6;

export function ProposalItemRow({
  item,
  selected,
  onToggle,
  onChanged,
}: {
  item: ProposalItemView;
  selected: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [dueDate, setDueDate] = useState(item.suggestedDueDate ?? '');
  const [hours, setHours] = useState(item.estimatedHours?.toString() ?? '');
  const [showQuote, setShowQuote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const converted = item.status === 'converted';
  const rejected = item.status === 'rejected';
  const lowConfidence = !item.manual && (item.confidence ?? 1) < LOW_CONFIDENCE;

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
            disabled={converted || rejected || pending}
            className="w-full bg-transparent text-sm font-semibold text-fluent-neutral-90 outline-none focus:rounded focus:bg-fluent-neutral-6 focus:px-1 disabled:cursor-default"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() =>
              description !== (item.description ?? '') && save({ description })
            }
            disabled={converted || rejected || pending}
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
                    disabled={converted || rejected || pending}
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
                    disabled={converted || rejected || pending}
                    className="w-16 rounded border border-fluent-neutral-20 px-1.5 py-0.5 text-fluent-neutral-80 outline-none focus:border-fluent-blue-500"
                  />
                </label>

                <select
                  value={item.priority ?? 'medium'}
                  onChange={(e) =>
                    save({ priority: e.target.value as ProposalItemView['priority'] })
                  }
                  disabled={converted || rejected || pending}
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
                  disabled={converted || rejected || pending}
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
