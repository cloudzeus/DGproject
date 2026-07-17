'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowSort20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BoardTaskModal, type BoardProjectOption } from '@/app/(app)/board/board-task-modal';
import { cn } from '@/lib/utils';
import type { CapacityRow } from '@/lib/dashboard/types';

const FREE_FMT = new Intl.DateTimeFormat('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function barColor(pct: number): string {
  if (pct > 95) return 'bg-fluent-accent-red';
  if (pct >= 70) return 'bg-fluent-accent-orange';
  return 'bg-fluent-accent-green';
}

function AvailabilityChip({ row }: { row: CapacityRow }) {
  if (row.freeNow) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-fluent-accent-green">
        Διαθέσιμος τώρα
      </span>
    );
  }
  if (row.nextFreeIso) {
    return (
      <span className="inline-flex items-center rounded-full bg-fluent-neutral-8 px-2 py-0.5 text-[11px] font-medium text-fluent-neutral-60">
        Ελεύθερος: {FREE_FMT.format(new Date(row.nextFreeIso))}
      </span>
    );
  }
  return <span className="text-[11px] text-fluent-neutral-50">—</span>;
}

type SortMode = 'availability' | 'load';

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

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">Χωρητικότητα ομάδας</h2>
          <p className="text-xs text-fluent-neutral-60 mt-0.5">{availableNow} διαθέσιμοι τώρα</p>
        </div>
        <button
          type="button"
          onClick={() => setSortMode((m) => (m === 'availability' ? 'load' : 'availability'))}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-fluent-neutral-20 px-2.5 py-1.5 text-xs font-medium text-fluent-neutral-70 hover:bg-fluent-neutral-6"
        >
          <ArrowSort20Regular className="h-4 w-4" />
          {sortMode === 'availability' ? 'κατά διαθεσιμότητα' : 'κατά φόρτο'}
        </button>
      </div>

      <ul className="divide-y divide-black/5">
        {sorted.map((row) => (
          <li key={row.userId} className="flex items-center gap-3 px-5 py-3">
            <Avatar user={{ name: row.name, avatarUrl: row.avatarUrl }} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fluent-neutral-90">{row.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 w-24 shrink-0 rounded-full bg-fluent-neutral-10 overflow-hidden">
                  <div
                    className={cn('h-full transition-all', barColor(row.utilizationPct))}
                    style={{ width: `${Math.min(100, row.utilizationPct)}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium tabular-nums text-fluent-neutral-70">
                  {row.utilizationPct}%
                </span>
                <span className="text-[11px] text-fluent-neutral-50 truncate">
                  {row.openTasks} ανοιχτά · {row.overdue} εκπρόθεσμα
                </span>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <AvailabilityChip row={row} />
              <Button variant="secondary" size="sm" onClick={() => setAssignUser(row)} disabled={projects.length === 0}>
                Ανάθεση
              </Button>
            </div>
          </li>
        ))}
      </ul>

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
