'use client';

/**
 * Μια γραμμή προσχεδίου: εμφάνιση και ενέργειες.
 *
 * Η επεξεργασία έφυγε σε modal (proposal-item-modal.tsx). Ήταν επιτόπου, με
 * διάφανα πεδία που αποκαλύπτονταν μόνο στο focus — συμπαγές, αλλά ο χρήστης
 * δεν είχε κανένα σημάδι ότι μπορεί να επέμβει, και δύο πράγματα δεν χωρούσαν
 * με τίποτα εκεί: η αλλαγή είδους και τα πεδία των απαιτήσεων.
 *
 * Στη γραμμή μένουν οι ενέργειες που ΔΕΝ είναι φόρμα: επιλογή, απόρριψη,
 * άνοιγμα του αποσπάσματος, και οι διευκρινίσεις προς το μοντέλο.
 *
 * Το απόσπασμα προέλευσης είναι διπλωμένο αλλά πάντα προσβάσιμο — είναι ο μόνος
 * τρόπος να απαντηθεί «πού το βρήκε αυτό;», και μια χαμηλή βεβαιότητα χωρίς
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
  Edit16Regular,
  EyeOff16Regular,
  Person16Regular,
  ArrowSync16Regular,
} from '@fluentui/react-icons';
import {
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

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Χαμηλή',
  medium: 'Μεσαία',
  high: 'Υψηλή',
  urgent: 'Επείγον',
};

export function ProposalItemRow({
  item,
  team,
  selected,
  onToggle,
  onEdit,
  onChanged,
}: {
  item: ProposalItemView;
  /** Όλη η ομάδα — για να δείξουμε το όνομα του αναδόχου. */
  team: ProposalMember[];
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarification, setClarification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const converted = item.status === 'converted';
  const rejected = item.status === 'rejected';
  const lowConfidence = !item.manual && (item.confidence ?? 1) < LOW_CONFIDENCE;
  const assignee = item.assigneeId ? team.find((m) => m.id === item.assigneeId) : null;

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
          <span className="mt-0.5 shrink-0 text-fluent-accent-green" title="Έγινε ήδη εργασία">
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
          <button
            type="button"
            onClick={onEdit}
            disabled={converted}
            className="block w-full text-left text-sm font-semibold text-fluent-neutral-90 hover:text-fluent-blue-700 disabled:cursor-default disabled:hover:text-fluent-neutral-90"
            title={converted ? 'Έγινε εργασία — άλλαξέ την από το board' : 'Επεξεργασία'}
          >
            {item.title}
          </button>

          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fluent-neutral-60">
              {item.description}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            {item.kind !== 'requirement' && (
              <>
                {item.suggestedDueDate && (
                  <Chip title="Προθεσμία της εργασίας που θα δημιουργηθεί">
                    {new Date(item.suggestedDueDate).toLocaleDateString('el-GR')}
                  </Chip>
                )}
                {item.suggestedOffsetDays != null && !item.suggestedDueDate && (
                  <Chip title="Η πρόταση δίνει διάστημα, όχι ημερομηνία — υπολογίζεται από την έναρξη του έργου">
                    +{item.suggestedOffsetDays} μέρες
                  </Chip>
                )}
                {item.estimatedHours != null && <Chip>{item.estimatedHours}ω</Chip>}
                {item.priority && item.priority !== 'medium' && (
                  <Chip>{PRIORITY_LABEL[item.priority]}</Chip>
                )}
                {assignee ? (
                  <Chip title="Ανάδοχος της εργασίας">
                    <Person16Regular className="h-3.5 w-3.5" />
                    {assignee.name || assignee.email}
                  </Chip>
                ) : (
                  <Chip muted title="Δεν έχει οριστεί ανάδοχος">
                    <Person16Regular className="h-3.5 w-3.5" />
                    χωρίς ανάθεση
                  </Chip>
                )}
              </>
            )}

            {item.kind === 'requirement' && item.requirementCategory && (
              <Chip>{item.requirementCategory}</Chip>
            )}

            {item.visibility === 'internal' && (
              <Chip title="Ο πελάτης δεν τη βλέπει στο portal">
                <EyeOff16Regular className="h-3.5 w-3.5" />
                εσωτερική
              </Chip>
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

            {item.manual && <Chip muted>χειροκίνητο</Chip>}

            {item.regeneratedFromId && (
              <span
                className="rounded bg-fluent-blue-50 px-1.5 py-0.5 text-fluent-blue-700"
                title={item.clarification ? `Διευκρίνιση: ${item.clarification}` : undefined}
              >
                από διευκρίνιση
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

        <div className="flex shrink-0 items-center gap-0.5">
          {!converted && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1.5 text-fluent-neutral-50 transition-colors hover:bg-fluent-neutral-8 hover:text-fluent-neutral-80"
              title="Επεξεργασία"
              aria-label="Επεξεργασία"
            >
              <Edit16Regular />
            </button>
          )}
          {!converted && (
            <button
              type="button"
              onClick={toggleRejected}
              disabled={pending}
              className="rounded p-1.5 text-fluent-neutral-40 transition-colors hover:bg-fluent-neutral-8 hover:text-fluent-neutral-70"
              title={rejected ? 'Επαναφορά' : 'Απόρριψη'}
              aria-label={rejected ? 'Επαναφορά' : 'Απόρριψη'}
            >
              {rejected ? <ArrowUndo16Regular /> : <Dismiss16Regular />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  children,
  title,
  muted,
}: {
  children: React.ReactNode;
  title?: string;
  muted?: boolean;
}) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
        muted ? 'bg-fluent-neutral-6 text-fluent-neutral-50' : 'bg-fluent-neutral-8 text-fluent-neutral-70',
      ].join(' ')}
    >
      {children}
    </span>
  );
}
