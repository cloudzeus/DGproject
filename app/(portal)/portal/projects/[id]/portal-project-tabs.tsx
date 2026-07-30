'use client';

import { useMemo, useState } from 'react';
import { PortalStatusBar } from '@/components/portal/status-bar';
import { countByState, completionPct, totalOf, toPortalState, TASK_STATE_META } from '@/components/portal/task-status';
import { PortalProjectClient, type PortalTask } from './portal-project-client';
import { PortalTeam, type PortalTeamMember } from './portal-team';
import { PortalFiles, type PortalFile } from './portal-files';
import { PortalMeetingCard } from '@/components/portal/meeting-card';
import type { PortalMeetingSummary } from '@/lib/portal/meetings';

type Tab = 'overview' | 'tasks' | 'team' | 'files' | 'meetings';

const fmtDay = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' });

/**
 * Η δομή της σελίδας έργου για τον πελάτη.
 *
 * Το πρόβλημα που λύνει: μία στήλη που μεγαλώνει με το έργο αναγκάζει τον πελάτη
 * να διαβάσει τα πάντα για να απαντήσει σε οτιδήποτε. Οι ερωτήσεις του είναι
 * τέσσερις — πάει καλά; τι γίνεται τώρα; χρειάζεται κάτι από μένα; ποιον ρωτάω;
 *
 * Η **Επισκόπηση** τις απαντά χωρίς κύλιση, ανεξάρτητα από το μέγεθος του έργου:
 * δείχνει μόνο ό,τι κινείται και ό,τι εκκρεμεί. Η πλήρης λίστα είναι ένα κλικ
 * μακριά για όποιον τη θέλει.
 *
 * Η κεφαλίδα με το ποσοστό είναι sticky ώστε η απάντηση στο «πάει καλά;» να μη
 * φεύγει ποτέ από την οθόνη.
 */
export function PortalProjectTabs({
  tasks,
  team,
  files,
  meetings,
  projectName,
  projectCode,
  statusLabel,
  color,
  dueDate,
}: {
  tasks: PortalTask[];
  team: PortalTeamMember[];
  files: PortalFile[];
  meetings: PortalMeetingSummary[];
  projectName: string;
  projectCode: string | null;
  statusLabel: string;
  color: string;
  dueDate: string | null;
}) {
  const [tab, setTab] = useState<Tab>('overview');

  const counts = useMemo(() => countByState(tasks.map((t) => t.status)), [tasks]);
  const pct = completionPct(counts);
  const total = totalOf(counts);

  const inProgress = tasks.filter((t) => toPortalState(t.status) === 'inProgress');
  const inReview = tasks.filter((t) => toPortalState(t.status) === 'inReview');
  const openQuestions = tasks.flatMap((t) =>
    t.questions.filter((q) => !q.answer).map((q) => ({ q, task: t })),
  );
  const upcoming = tasks
    .filter((t) => t.dueDate && toPortalState(t.status) !== 'done')
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5);
  const recentlyDone = tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
    .slice(0, 5);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Επισκόπηση' },
    { key: 'tasks', label: 'Εργασίες', count: total },
    { key: 'team', label: 'Ομάδα', count: team.length },
    { key: 'files', label: 'Αρχεία', count: files.length },
    { key: 'meetings', label: 'Συσκέψεις', count: meetings.length },
  ];

  return (
    <div>
      {/* ─── Sticky κεφαλίδα: η απάντηση στο «πάει καλά;» δεν φεύγει ποτέ ─── */}
      <div className="sticky top-14 z-30 -mx-4 border-b border-black/5 bg-fluent-neutral-4/85 px-4 pb-0 pt-3 backdrop-blur-xl lg:-mx-6 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
              {statusLabel}
              {projectCode && <span className="ml-2 font-mono normal-case">{projectCode}</span>}
            </p>
            <h1 className="flex items-center gap-2 truncate font-display text-xl font-semibold tracking-tight text-fluent-neutral-90">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              {projectName}
            </h1>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-display text-2xl font-semibold leading-none tabular-nums text-fluent-neutral-90">
              {pct}
              <span className="text-base font-medium text-fluent-neutral-60">%</span>
            </p>
            <p className="text-[10px] tabular-nums text-fluent-neutral-60">
              {counts.done}/{total} εργασίες
              {dueDate && ` · ${fmtDay.format(new Date(dueDate))}`}
            </p>
          </div>
        </div>

        <div className="mt-2.5">
          <PortalStatusBar counts={counts} showLegend={false} height="h-1.5" />
        </div>

        <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Ενότητες έργου">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={active ? 'page' : undefined}
                className={`relative shrink-0 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                  active
                    ? 'text-fluent-blue-700'
                    : 'text-fluent-neutral-60 hover:text-fluent-neutral-90'
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1.5 text-xs tabular-nums text-fluent-neutral-50">{t.count}</span>
                )}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-fluent-blue-600" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-6">
        {tab === 'overview' && (
          <div className="space-y-5">
            {openQuestions.length > 0 && (
              <section className="rounded-xl border border-fluent-accent-orange/25 bg-[#fffaf5] p-4">
                <h2 className="font-display text-sm font-semibold text-fluent-neutral-90">
                  Χρειαζόμαστε την απάντησή σας
                </h2>
                <div className="mt-2 space-y-2">
                  {openQuestions.slice(0, 4).map(({ q, task }) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setTab('tasks')}
                      className="block w-full rounded-lg bg-white/70 px-3 py-2 text-left transition-colors hover:bg-white"
                    >
                      <p className="text-[11px] text-fluent-neutral-60">{task.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-fluent-neutral-90">{q.question}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <OverviewList
              title="Σε εξέλιξη τώρα"
              empty="Καμία εργασία σε ενεργή δουλειά αυτή τη στιγμή."
              tasks={[...inProgress, ...inReview]}
              onOpen={() => setTab('tasks')}
            />

            {upcoming.length > 0 && (
              <OverviewList
                title="Επόμενες προθεσμίες"
                tasks={upcoming}
                showDue
                onOpen={() => setTab('tasks')}
              />
            )}

            {recentlyDone.length > 0 && (
              <OverviewList
                title="Ολοκληρώθηκαν πρόσφατα"
                tasks={recentlyDone}
                showCompleted
                onOpen={() => setTab('tasks')}
              />
            )}
          </div>
        )}

        {tab === 'tasks' && <PortalProjectClient tasks={tasks} />}
        {tab === 'team' && <PortalTeam members={team} projectCode={projectCode} projectName={projectName} />}
        {tab === 'files' && <PortalFiles files={files} />}
        {tab === 'meetings' && (
          <section>
            <h2 className="mb-2 font-display text-base font-semibold text-fluent-neutral-90">
              Πρακτικά συσκέψεων
            </h2>
            {meetings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-4 py-8 text-center text-xs text-fluent-neutral-60">
                Δεν έχουν δημοσιευτεί πρακτικά για αυτό το έργο ακόμα.
              </p>
            ) : (
              <div className="space-y-3">
                {meetings.map((m) => (
                  <PortalMeetingCard key={m.id} meeting={m} showProject={false} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function OverviewList({
  title,
  tasks,
  empty,
  showDue,
  showCompleted,
  onOpen,
}: {
  title: string;
  tasks: PortalTask[];
  empty?: string;
  showDue?: boolean;
  showCompleted?: boolean;
  onOpen: () => void;
}) {
  return (
    <section>
      <h2 className="mb-2 font-display text-sm font-semibold text-fluent-neutral-90">{title}</h2>
      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-4 py-6 text-center text-xs text-fluent-neutral-60">
          {empty}
        </p>
      ) : (
        <div className="divide-y divide-black/5 overflow-hidden rounded-xl border border-fluent-neutral-10 bg-white shadow-fluent-2">
          {tasks.map((t) => {
            const state = toPortalState(t.status);
            return (
              <button
                key={t.id}
                type="button"
                onClick={onOpen}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-fluent-neutral-4"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: TASK_STATE_META[state].color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fluent-neutral-90">
                  {t.title}
                </span>
                {showDue && t.dueDate && (
                  <span className="shrink-0 text-[11px] tabular-nums text-fluent-neutral-60">
                    {fmtDay.format(new Date(t.dueDate))}
                  </span>
                )}
                {showCompleted && t.completedAt && (
                  <span className="shrink-0 text-[11px] tabular-nums text-fluent-neutral-60">
                    {fmtDay.format(new Date(t.completedAt))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
