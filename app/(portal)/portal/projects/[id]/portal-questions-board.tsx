'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChatBubblesQuestion20Regular,
  Search20Regular,
  Send20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { toPortalState } from '@/components/portal/task-status';
import { answerPortalQuestion } from '../../actions';
import type { PortalQuestion, PortalTask } from './portal-project-client';

type QuestionColumn = 'open' | 'waiting' | 'review' | 'done';
type QuestionFilter = 'all' | 'open' | 'answered';
type BoardItem = { question: PortalQuestion; task: PortalTask };

const COLUMNS: {
  key: QuestionColumn;
  label: string;
  description: string;
  dot: string;
}[] = [
  { key: 'open', label: 'Προς απάντηση', description: 'Χρειάζονται τη δική σας απάντηση', dot: '#D83B01' },
  { key: 'waiting', label: 'Σε επεξεργασία', description: 'Η απάντηση έχει σταλεί στην ομάδα', dot: '#0078D4' },
  { key: 'review', label: 'Σε έλεγχο', description: 'Η σχετική εργασία ελέγχεται', dot: '#8764B8' },
  { key: 'done', label: 'Ολοκληρωμένες', description: 'Η σχετική εργασία ολοκληρώθηκε', dot: '#107C10' },
];

const fmt = new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' });

function columnFor(item: BoardItem): QuestionColumn {
  if (!item.question.answer) return 'open';
  const state = toPortalState(item.task.status);
  if (state === 'done') return 'done';
  if (state === 'inReview') return 'review';
  return 'waiting';
}

/**
 * Kanban μόνο για τις ερωτήσεις που έχει ήδη φιλτράρει ο server για τον πελάτη.
 * Δεν υπάρχει drag-and-drop: η μόνη αλλαγή κατάστασης είναι η πραγματική,
 * persisted απάντηση μέσω της υπάρχουσας, εξουσιοδοτημένης server action.
 */
export function PortalQuestionsBoard({ tasks }: { tasks: PortalTask[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [selected, setSelected] = useState<BoardItem | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const items = useMemo<BoardItem[]>(
    () => tasks.flatMap((task) => task.questions.map((question) => ({ question, task }))),
    [tasks],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('el-GR');
    return items.filter((item) => {
      if (filter === 'open' && item.question.answer) return false;
      if (filter === 'answered' && !item.question.answer) return false;
      if (!needle) return true;
      return [item.question.question, item.question.askedByName, item.task.title]
        .join(' ')
        .toLocaleLowerCase('el-GR')
        .includes(needle);
    });
  }, [items, query, filter]);

  const openCount = items.filter((item) => !item.question.answer).length;

  function openItem(item: BoardItem) {
    setSelected(item);
    setAnswer('');
    setError(null);
  }

  function closeItem() {
    setSelected(null);
    setAnswer('');
    setError(null);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-12 text-center">
        <ChatBubblesQuestion20Regular className="mx-auto h-7 w-7 text-fluent-neutral-40" />
        <p className="mt-3 text-sm font-medium text-fluent-neutral-80">Δεν υπάρχουν ερωτήσεις ακόμα</p>
        <p className="mt-1 text-xs text-fluent-neutral-60">
          Όταν η ομάδα σας στείλει μια ερώτηση, θα εμφανιστεί εδώ για απάντηση.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-fluent-neutral-90">Kanban ερωτήσεων</h2>
          <p className="mt-0.5 text-xs text-fluent-neutral-60">
            {openCount > 0
              ? `${openCount} ${openCount === 1 ? 'ερώτηση χρειάζεται' : 'ερωτήσεις χρειάζονται'} την απάντησή σας.`
              : 'Έχετε απαντήσει σε όλες τις ερωτήσεις.'}
          </p>
        </div>
        <label className="relative block sm:w-72">
          <span className="sr-only">Αναζήτηση ερωτήσεων</span>
          <Search20Regular className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fluent-neutral-50" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Αναζήτηση σε ερωτήσεις…"
            className="h-9 w-full rounded-md border border-fluent-neutral-20 bg-white pl-9 pr-3 text-sm text-fluent-neutral-90 outline-none transition-colors placeholder:text-fluent-neutral-50 focus:border-fluent-blue-500 focus:ring-1 focus:ring-fluent-blue-500"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Φίλτρο απαντήσεων">
        {([
          ['all', 'Όλες', items.length],
          ['open', 'Προς απάντηση', openCount],
          ['answered', 'Απαντημένες', items.length - openCount],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fluent-blue-500 ${
              filter === key
                ? 'bg-fluent-neutral-90 text-white'
                : 'bg-white text-fluent-neutral-70 ring-1 ring-fluent-neutral-10 hover:bg-fluent-neutral-4'
            }`}
          >
            {label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnItems = visible.filter((item) => columnFor(item) === column.key);
          return (
            <section
              key={column.key}
              className="min-w-0 rounded-xl border border-fluent-neutral-10 bg-fluent-neutral-4/70 p-2.5"
              aria-label={column.label}
            >
              <div className="px-1 pb-2.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.dot }} aria-hidden />
                  <h3 className="text-xs font-semibold text-fluent-neutral-90">{column.label}</h3>
                  <span className="ml-auto text-xs tabular-nums text-fluent-neutral-50">{columnItems.length}</span>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-fluent-neutral-60">{column.description}</p>
              </div>

              <div className="space-y-2">
                {columnItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-fluent-neutral-20 px-3 py-6 text-center text-[11px] text-fluent-neutral-50">
                    Καμία ερώτηση εδώ
                  </p>
                ) : (
                  columnItems.map((item) => (
                    <article key={item.question.id} className="rounded-lg border border-black/5 bg-white p-3 shadow-fluent-2">
                      <p className="line-clamp-1 text-[10px] font-medium text-fluent-blue-700">{item.task.title}</p>
                      <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-fluent-neutral-90">
                        {item.question.question}
                      </p>
                      {item.question.answer && (
                        <p className="mt-2 line-clamp-2 rounded-md bg-fluent-neutral-4 p-2 text-[11px] leading-relaxed text-fluent-neutral-70">
                          {item.question.answer}
                        </p>
                      )}
                      <div className="mt-3 border-t border-black/5 pt-2 text-[10px] text-fluent-neutral-60">
                        <p className="truncate">{item.question.askedByName}</p>
                        <p className="mt-0.5 tabular-nums">
                          {fmt.format(new Date(item.question.answeredAt ?? item.question.createdAt))}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={item.question.answer ? 'secondary' : 'primary'}
                        className="mt-2.5 w-full"
                        onClick={() => openItem(item)}
                      >
                        {item.question.answer ? 'Προβολή απάντησης' : 'Απάντηση'}
                      </Button>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {selected && (
        <Modal
          title={selected.question.answer ? 'Ερώτηση και απάντηση' : 'Απαντήστε στην ερώτηση'}
          description={selected.task.title}
          onClose={closeItem}
        >
          <div className="space-y-4">
            <div>
              <p className="text-[11px] text-fluent-neutral-60">
                {selected.question.askedByName} · {fmt.format(new Date(selected.question.createdAt))}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fluent-neutral-90">
                {selected.question.question}
              </p>
            </div>

            {selected.question.answer ? (
              <div className="rounded-lg bg-fluent-neutral-4 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-fluent-neutral-60">Η απάντησή σας</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-fluent-neutral-80">
                  {selected.question.answer}
                </p>
                {selected.question.answeredAt && (
                  <p className="mt-2 text-[10px] tabular-nums text-fluent-neutral-50">
                    {fmt.format(new Date(selected.question.answeredAt))}
                  </p>
                )}
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!answer.trim() || pending) return;
                  startTransition(async () => {
                    setError(null);
                    const result = await answerPortalQuestion(selected.question.id, answer);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    closeItem();
                    router.refresh();
                  });
                }}
              >
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-fluent-neutral-80">Η απάντησή σας</span>
                  <textarea
                    autoFocus
                    required
                    rows={5}
                    maxLength={5000}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Γράψτε την απάντησή σας…"
                    className="w-full resize-y rounded-md border border-fluent-neutral-20 bg-white px-3 py-2 text-sm leading-relaxed text-fluent-neutral-90 outline-none transition-colors placeholder:text-fluent-neutral-50 focus:border-fluent-blue-500 focus:ring-1 focus:ring-fluent-blue-500"
                  />
                </label>
                {error && <p role="alert" className="text-xs text-fluent-accent-red">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] tabular-nums text-fluent-neutral-50">{answer.length}/5000</span>
                  <Button
                    type="submit"
                    variant="primary"
                    icon={<Send20Regular />}
                    disabled={pending || !answer.trim()}
                  >
                    {pending ? 'Αποστολή…' : 'Αποστολή απάντησης'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
