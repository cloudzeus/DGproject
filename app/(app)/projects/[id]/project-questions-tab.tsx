'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  ChatBubblesQuestion20Regular,
  Search20Regular,
  Dismiss20Regular,
  ChevronDown20Regular,
  CheckmarkCircle20Filled,
  Open20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import {
  QuestionThread,
  NewQuestionComposer,
  type ProjectMemberOption,
  type TaskQuestionInfo,
} from './task-questions-panel';

type TaskQuestionsGroup = {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  questions: TaskQuestionInfo[];
};

type Filter = 'all' | 'pending' | 'answered';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Όλες',
  pending: 'Εκκρεμείς',
  answered: 'Απαντημένες',
};

export function ProjectQuestionsTab({
  projectId,
  taskGroups,
  members,
  currentUserId,
  isPrivileged,
}: {
  projectId: string;
  taskGroups: TaskQuestionsGroup[];
  members: ProjectMemberOption[];
  currentUserId: string;
  isPrivileged: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [composingTaskId, setComposingTaskId] = useState<string | null>(null);

  const askable = members.filter((m) => m.id !== currentUserId);

  const stats = useMemo(() => {
    let pending = 0;
    let answered = 0;
    for (const g of taskGroups) {
      for (const q of g.questions) {
        if (q.answer) answered += 1;
        else pending += 1;
      }
    }
    return { pending, answered, total: pending + answered };
  }, [taskGroups]);

  // Filter logic: apply text + status to all messages, but keep their thread
  // ancestors visible so context isn't lost.
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();

    return taskGroups
      .map((group) => {
        const byId = new Map(group.questions.map((it) => [it.id, it]));
        const matched = new Set<string>();

        for (const item of group.questions) {
          const statusOk =
            filter === 'all' ||
            (filter === 'pending' && !item.answer) ||
            (filter === 'answered' && !!item.answer);
          if (!statusOk) continue;
          const haystack =
            (item.question + ' ' + (item.answer ?? '') +
              ' ' + item.askedBy.name + ' ' + item.askedTo.name).toLowerCase();
          if (q.length === 0 || haystack.includes(q)) {
            matched.add(item.id);
            // Also keep ancestors so the thread reads correctly
            let cur: TaskQuestionInfo | undefined = item;
            while (cur?.parentId) {
              const parent = byId.get(cur.parentId);
              if (!parent) break;
              matched.add(parent.id);
              cur = parent;
            }
          }
        }
        // Also pull in titles in search
        if (q.length > 0 && group.taskTitle.toLowerCase().includes(q)) {
          // include all when task title matches
          group.questions.forEach((it) => {
            const statusOk =
              filter === 'all' ||
              (filter === 'pending' && !it.answer) ||
              (filter === 'answered' && !!it.answer);
            if (statusOk) matched.add(it.id);
          });
        }

        const filtered = group.questions.filter((it) => matched.has(it.id));
        return { ...group, questions: filtered };
      })
      .filter((group) => group.questions.length > 0)
      .sort((a, b) => {
        // newest activity first
        const aLast = Math.max(
          ...a.questions.map((q) => (q.answeredAt ?? q.createdAt).getTime()),
        );
        const bLast = Math.max(
          ...b.questions.map((q) => (q.answeredAt ?? q.createdAt).getTime()),
        );
        return bLast - aLast;
      });
  }, [taskGroups, filter, search]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-fluent-blue-50 flex items-center justify-center">
            <ChatBubblesQuestion20Regular className="h-5 w-5 text-fluent-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fluent-neutral-90 leading-tight">
              Ερωτήσεις & Απαντήσεις
            </h2>
            <p className="text-xs text-fluent-neutral-60">
              {stats.total === 0
                ? 'Καμία ερώτηση ακόμη στο έργο'
                : `${stats.total} συνολικά · ${stats.pending} εκκρεμ${stats.pending === 1 ? 'εί' : 'ούν'} · ${stats.answered} απαντημέν${stats.answered === 1 ? 'η' : 'ες'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search20Regular className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-fluent-neutral-60" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Αναζήτηση…"
              className="h-9 pl-8 pr-7 rounded-md border border-fluent-neutral-20 bg-white text-sm w-56 focus:border-fluent-blue-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
                aria-label="Καθαρισμός"
              >
                <Dismiss20Regular className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="inline-flex rounded-md border border-fluent-neutral-20 bg-white overflow-hidden">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => {
              const active = filter === f;
              const badge =
                f === 'pending' ? stats.pending : f === 'answered' ? stats.answered : stats.total;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`h-9 px-3 text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-fluent-blue-50 text-fluent-blue-700'
                      : 'text-fluent-neutral-80 hover:bg-fluent-neutral-4'
                  }`}
                >
                  {FILTER_LABEL[f]}
                  <span
                    className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums font-semibold inline-flex items-center justify-center ${
                      active ? 'bg-fluent-blue-600 text-white' : 'bg-fluent-neutral-8 text-fluent-neutral-70'
                    }`}
                  >
                    {badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {filteredGroups.length === 0 ? (
        <EmptyState
          totalQuestions={stats.total}
          hasFilter={search.length > 0 || filter !== 'all'}
        />
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <TaskQuestionsSection
              key={group.taskId}
              projectId={projectId}
              group={group}
              askable={askable}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              composing={composingTaskId === group.taskId}
              onStartCompose={() => setComposingTaskId(group.taskId)}
              onCancelCompose={() => setComposingTaskId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskQuestionsSection({
  projectId,
  group,
  askable,
  currentUserId,
  isPrivileged,
  composing,
  onStartCompose,
  onCancelCompose,
}: {
  projectId: string;
  group: TaskQuestionsGroup;
  askable: ProjectMemberOption[];
  currentUserId: string;
  isPrivileged: boolean;
  composing: boolean;
  onStartCompose: () => void;
  onCancelCompose: () => void;
}) {
  const [open, setOpen] = useState(true);

  // Threads inside this task: build parent → children map.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, TaskQuestionInfo[]>();
    for (const q of group.questions) {
      const key = q.parentId ?? '__root__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    return map;
  }, [group.questions]);

  const roots = useMemo(() => {
    const r = [...(childrenByParent.get('__root__') ?? [])];
    // If a follow-up survived a filter but its root didn't, treat it as a root
    // so threading still renders something meaningful.
    const presentIds = new Set(group.questions.map((q) => q.id));
    for (const q of group.questions) {
      if (q.parentId && !presentIds.has(q.parentId) && !r.includes(q)) {
        r.push(q);
      }
    }
    r.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return r;
  }, [childrenByParent, group.questions]);

  const pendingInTask = group.questions.filter((q) => !q.answer).length;

  return (
    <section className="bg-white rounded-xl border border-fluent-neutral-10 shadow-fluent-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-fluent-neutral-4 transition-colors text-left"
      >
        <motion.div
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.18 }}
          className="text-fluent-neutral-60 shrink-0"
        >
          <ChevronDown20Regular className="h-4 w-4" />
        </motion.div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-fluent-neutral-90 truncate">
              {group.taskTitle}
            </h3>
            <span className="text-[11px] font-medium text-fluent-neutral-60 px-1.5 py-0.5 rounded-full bg-fluent-neutral-8 shrink-0">
              {group.questions.length}
            </span>
            {pendingInTask > 0 && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-fluent-accent-orange/10 text-fluent-accent-orange">
                {pendingInTask} εκκρεμ{pendingInTask === 1 ? 'εί' : 'ούν'}
              </span>
            )}
            {pendingInTask === 0 && group.questions.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-fluent-accent-green/10 text-fluent-accent-green">
                <CheckmarkCircle20Filled className="h-3 w-3" />
                Όλες απαντημένες
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/projects/${projectId}?task=${group.taskId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-fluent-blue-700 hover:text-fluent-blue-800 inline-flex items-center gap-1 shrink-0"
        >
          <Open20Regular className="h-4 w-4" />
          Άνοιγμα εργασίας
        </Link>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 border-t border-fluent-neutral-10 space-y-3">
              <div className="flex justify-end">
                {!composing && askable.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<ChatBubblesQuestion20Regular className="h-4 w-4" />}
                    onClick={onStartCompose}
                  >
                    Νέα ερώτηση
                  </Button>
                )}
              </div>
              <AnimatePresence initial={false}>
                {composing && (
                  <motion.div
                    key="composer"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <NewQuestionComposer
                      projectId={projectId}
                      taskId={group.taskId}
                      members={askable}
                      onCancel={onCancelCompose}
                      onCreated={onCancelCompose}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {roots.length === 0 ? (
                <p className="text-xs text-fluent-neutral-60 px-1 py-2">
                  Καμία ερώτηση μετά τα φίλτρα.
                </p>
              ) : (
                <div className="space-y-3">
                  {roots.map((root) => (
                    <QuestionThread
                      key={root.id}
                      projectId={projectId}
                      taskId={group.taskId}
                      root={root}
                      childrenByParent={childrenByParent}
                      members={askable}
                      currentUserId={currentUserId}
                      isPrivileged={isPrivileged}
                      onChanged={() => {
                        // server action revalidates the page; nothing to do client-side.
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function EmptyState({
  totalQuestions,
  hasFilter,
}: {
  totalQuestions: number;
  hasFilter: boolean;
}) {
  if (totalQuestions === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-fluent-neutral-20 bg-white px-6 py-10 text-center">
        <ChatBubblesQuestion20Regular className="h-10 w-10 mx-auto text-fluent-neutral-40 mb-3" />
        <p className="text-sm font-semibold text-fluent-neutral-90">Καμία ερώτηση ακόμη</p>
        <p className="text-xs text-fluent-neutral-60 mt-1 max-w-md mx-auto">
          Όταν θέτεις ερωτήσεις σε μέλη του έργου από οποιαδήποτε εργασία, θα εμφανίζονται εδώ
          συγκεντρωμένες. Μπορείς να ξεκινήσεις πρώτη ερώτηση από την καρτέλα μιας εργασίας.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-fluent-neutral-10 bg-white px-4 py-6 text-center">
      <p className="text-sm text-fluent-neutral-70 font-medium">
        {hasFilter ? 'Δεν βρέθηκαν ερωτήσεις με αυτά τα φίλτρα.' : 'Καμία ερώτηση.'}
      </p>
    </div>
  );
}
