'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowSortDown16Filled, ArrowSortUp16Filled } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { STATUS_LABELS_EL } from '@/lib/reports/shared';
import type { ProjectsReport, ProjectReportRow } from '@/lib/reports/projects';

type SortKey = 'name' | 'completedInPeriod' | 'velocityPerWeek' | 'netFlow' | 'trackedHours' | 'avgCycleHours' | 'overdue' | 'completionPct';

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'name', label: 'Έργο' },
  { key: 'completionPct', label: 'Πρόοδος' },
  { key: 'completedInPeriod', label: 'Ολοκλ. στην περίοδο' },
  { key: 'velocityPerWeek', label: 'Velocity/εβδ.' },
  { key: 'netFlow', label: 'Net flow', title: 'Νέα tasks μείον ολοκληρώσεις στην περίοδο' },
  { key: 'trackedHours', label: 'Ώρες (πραγμ./εκτ.)' },
  { key: 'avgCycleHours', label: 'Μ.ό. cycle' },
  { key: 'overdue', label: 'Εκπρόθεσμα' },
];

export function ProjectsTab({ data }: { data: ProjectsReport }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'completedInPeriod', dir: -1 });
  const rows = useMemo(() => {
    const r = [...data.rows];
    r.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string' && typeof bv === 'string') return sort.dir * av.localeCompare(bv, 'el');
      return sort.dir * ((Number(av ?? -1)) - (Number(bv ?? -1)));
    });
    return r;
  }, [data.rows, sort]);

  if (data.rows.length === 0) {
    return <p className="py-16 text-center text-sm text-fluent-neutral-50">Κανένα έργο.</p>;
  }
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5 bg-fluent-neutral-4/40">
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-4 py-2.5 whitespace-nowrap" title={c.title}>
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}
                  className="inline-flex items-center gap-1 hover:text-fluent-neutral-90"
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === -1 ? <ArrowSortDown16Filled className="h-3 w-3" /> : <ArrowSortUp16Filled className="h-3 w-3" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => <Row key={p.id} p={p} />)}
        </tbody>
      </table>
    </div>
  );
}

function Row({ p }: { p: ProjectReportRow }) {
  return (
    <tr className="border-b border-black/[0.03] last:border-0 hover:bg-fluent-blue-50/30">
      <td className="px-4 py-3 min-w-[200px]">
        <Link href={`/projects/${p.id}`} className="flex items-center gap-2 group">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="font-medium text-fluent-neutral-90 group-hover:text-fluent-blue-600 truncate">{p.name}</span>
          <span className="text-[10px] text-fluent-neutral-50">{STATUS_LABELS_EL[p.status]}</span>
        </Link>
      </td>
      <td className="px-4 py-3 w-36">
        <div className="flex items-center gap-2">
          <span className="flex-1 h-1.5 rounded-full bg-fluent-neutral-8 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${p.completionPct}%`, background: p.color }} />
          </span>
          <span className="text-[11px] tabular-nums font-semibold w-8 text-right">{p.completionPct}%</span>
        </div>
        <span className="text-[10px] text-fluent-neutral-50 tabular-nums">{p.done}/{p.total}</span>
      </td>
      <td className="px-4 py-3 tabular-nums font-semibold">{p.completedInPeriod}</td>
      <td className="px-4 py-3 tabular-nums">{p.velocityPerWeek}</td>
      <td className={cn('px-4 py-3 tabular-nums font-semibold', p.netFlow > 0 ? 'text-fluent-accent-orange' : 'text-fluent-neutral-70')}>
        {p.netFlow > 0 ? `+${p.netFlow}` : p.netFlow}
      </td>
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
        {p.trackedHours}h <span className="text-fluent-neutral-50">/ {p.estimatedHours}h</span>
      </td>
      <td className="px-4 py-3 tabular-nums">
        {p.avgCycleHours === null ? '—' : `${p.avgCycleHours}h`}
        {p.cycleN > 0 && p.cycleN < 5 && <span className="text-[10px] text-fluent-neutral-50 ml-1">n={p.cycleN}</span>}
      </td>
      <td className={cn('px-4 py-3 tabular-nums', p.overdue > 0 && 'text-fluent-accent-red font-semibold')}>{p.overdue}</td>
    </tr>
  );
}
