'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PeopleTeam20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BoardTaskModal, type BoardProjectOption } from '@/app/(app)/board/board-task-modal';
import { cn } from '@/lib/utils';
import type { CapacityRow } from '@/lib/dashboard/types';

const FREE_FMT = new Intl.DateTimeFormat('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Πάνω από 6 γραμμές η λίστα γίνεται scrollable (≈6 × 56px). */
const MAX_VISIBLE_ROWS = 6;
const ROW_HEIGHT_PX = 56;

function loadTone(pct: number): { bar: string; text: string } {
  if (pct > 95) return { bar: 'bg-fluent-accent-red', text: 'text-fluent-accent-red' };
  if (pct >= 70) return { bar: 'bg-fluent-accent-orange', text: 'text-fluent-accent-orange' };
  return { bar: 'bg-fluent-accent-green', text: 'text-fluent-neutral-70' };
}

function Availability({ row }: { row: CapacityRow }) {
  if (row.freeNow) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fluent-accent-green">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fluent-accent-green opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-fluent-accent-green" />
        </span>
        Διαθέσιμος τώρα
      </span>
    );
  }
  if (row.nextFreeIso) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-fluent-neutral-60">
        <span className="h-2 w-2 shrink-0 rounded-full bg-fluent-neutral-30" />
        <span className="truncate">Ελεύθερος {FREE_FMT.format(new Date(row.nextFreeIso))}</span>
      </span>
    );
  }
  return <span className="text-[11px] text-fluent-neutral-50">—</span>;
}

type SortMode = 'availability' | 'load';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'availability', label: 'Διαθεσιμότητα' },
  { value: 'load', label: 'Φόρτος' },
];

export function CapacityZone({ rows, projects }: { rows: CapacityRow[]; projects: BoardProjectOption[] }) {
  const [sortMode, setSortMode] = useState<SortMode>('availability');
  const [assignUser, setAssignUser] = useState<CapacityRow | null>(null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortMode === 'load') {
      copy.sort((a, b) => b.utilizationPct - a.utilizationPct || b.openTasks - a.openTasks);
    } else {
      copy.sort((a, b) => a.utilizationPct - b.utilizationPct || a.openTasks - b.openTasks);
    }
    return copy;
  }, [rows, sortMode]);

  if (rows.length === 0) return null;

  const availableNow = rows.filter((r) => r.freeNow).length;
  const totalOverdue = rows.reduce((sum, r) => sum + r.overdue, 0);
  const scrollable = rows.length > MAX_VISIBLE_ROWS;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-black/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fluent-blue-50 text-fluent-blue-600">
            <PeopleTeam20Regular className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-95 leading-tight">
              Χωρητικότητα ομάδας
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-fluent-neutral-60">
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-medium',
                  availableNow > 0 ? 'text-fluent-accent-green' : 'text-fluent-neutral-60',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    availableNow > 0 ? 'bg-fluent-accent-green' : 'bg-fluent-neutral-30',
                  )}
                />
                {availableNow} διαθέσιμοι τώρα
              </span>
              <span className="text-fluent-neutral-30">·</span>
              <span>{rows.length} μέλη</span>
              {totalOverdue > 0 && (
                <>
                  <span className="text-fluent-neutral-30">·</span>
                  <span className="font-medium text-fluent-accent-red">{totalOverdue} εκπρόθεσμα</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex rounded-lg bg-fluent-neutral-6 p-0.5" role="tablist" aria-label="Ταξινόμηση">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={sortMode === opt.value}
              onClick={() => setSortMode(opt.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                sortMode === opt.value
                  ? 'bg-white text-fluent-neutral-90 shadow-fluent-2'
                  : 'text-fluent-neutral-60 hover:text-fluent-neutral-90',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <ul
          className={cn('divide-y divide-black/5', scrollable && 'overflow-y-auto overscroll-contain')}
          style={scrollable ? { maxHeight: `${MAX_VISIBLE_ROWS * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2}px` } : undefined}
        >
          {sorted.map((row) => {
            const tone = loadTone(row.utilizationPct);
            return (
              <li
                key={row.userId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-2.5 transition-colors hover:bg-fluent-neutral-4 sm:grid-cols-[minmax(150px,200px)_minmax(110px,1fr)_10rem_max-content]"
                style={{ minHeight: ROW_HEIGHT_PX }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar user={{ name: row.name, avatarUrl: row.avatarUrl }} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fluent-neutral-90">{row.name}</p>
                    <p className="truncate text-[11px] text-fluent-neutral-50">
                      {row.openTasks} ανοιχτά
                      {row.overdue > 0 && (
                        <>
                          {' · '}
                          <span className="font-medium text-fluent-accent-red">{row.overdue} εκπρόθεσμα</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="hidden items-center gap-2.5 sm:flex">
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-fluent-neutral-10">
                    <div
                      className={cn('h-full rounded-full transition-all', tone.bar)}
                      style={{ width: `${Math.min(100, row.utilizationPct)}%` }}
                    />
                  </div>
                  <span className={cn('w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums', tone.text)}>
                    {row.utilizationPct}%
                  </span>
                </div>

                <div className="hidden min-w-0 sm:block">
                  <Availability row={row} />
                </div>

                <div className="justify-self-end">
                  <Button variant="secondary" size="sm" onClick={() => setAssignUser(row)} disabled={projects.length === 0}>
                    Ανάθεση
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {scrollable && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>

      {assignUser && (
        <BoardTaskModal
          mode="create"
          projects={projects}
          defaultAssigneeIds={[assignUser.userId]}
          onClose={() => setAssignUser(null)}
        />
      )}
    </motion.section>
  );
}
