'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowSortDown16Filled, ArrowSortUp16Filled } from '@fluentui/react-icons';
import { KpiTile } from '@/components/reports/kpi-tile';
import { cn } from '@/lib/utils';
import { pctDelta, STATUS_LABELS_EL } from '@/lib/reports/shared';
import type { ProjectsReport, ProjectReportRow } from '@/lib/reports/projects';

type SortKey = 'name' | 'completedInPeriod' | 'velocityPerWeek' | 'netFlow' | 'trackedHours' | 'laborCost' | 'billableHours' | 'avgCycleHours' | 'onTimePct' | 'overdue' | 'completionPct';

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'name', label: 'Έργο' },
  { key: 'completionPct', label: 'Πρόοδος' },
  { key: 'completedInPeriod', label: 'Ολοκλ. στην περίοδο' },
  { key: 'velocityPerWeek', label: 'Velocity/εβδ.' },
  { key: 'netFlow', label: 'Net flow', title: 'Νέα tasks μείον ολοκληρώσεις στην περίοδο' },
  { key: 'onTimePct', label: 'Εντός προθεσμίας', title: 'Ολοκληρώσεις περιόδου με προθεσμία' },
  { key: 'trackedHours', label: 'Ώρες (πραγμ./εκτ.)' },
  { key: 'billableHours', label: 'Χρεώσιμες', title: 'Χρεώσιμες ώρες tasks που ολοκληρώθηκαν στην περίοδο' },
  { key: 'laborCost', label: 'Κόστος (80 €/h)', title: 'Πραγματικές καταχωρισμένες ώρες × 80 €/ώρα' },
  { key: 'avgCycleHours', label: 'Μ.ό. cycle' },
  { key: 'overdue', label: 'Εκπρόθεσμα' },
];

export function ProjectsTab({ data }: { data: ProjectsReport }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'completedInPeriod', dir: -1 });
  const rows = useMemo(() => {
    const result = [...data.rows];
    result.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string' && typeof bv === 'string') return sort.dir * av.localeCompare(bv, 'el');
      return sort.dir * (Number(av ?? -1) - Number(bv ?? -1));
    });
    return result;
  }, [data.rows, sort]);
  const completed = data.rows.reduce((sum, project) => sum + project.completedInPeriod, 0);
  const completedPrevious = data.rows.reduce((sum, project) => sum + project.completedPreviousPeriod, 0);
  const created = data.rows.reduce((sum, project) => sum + project.createdInPeriod, 0);
  const withDue = data.rows.reduce((sum, project) => sum + project.onTimeN, 0);
  const onTimeWeighted = data.rows.reduce((sum, project) => sum + (project.onTimePct ?? 0) * project.onTimeN, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
        <KpiTile label="Ενεργά έργα" value={data.rows.filter((project) => project.status === 'active').length} subtitle={`${data.rows.length} συνολικά`} />
        <KpiTile label="Ολοκληρώσεις" value={completed} delta={pctDelta(completed, completedPrevious)} subtitle={`${created} νέα tasks`} />
        <KpiTile label="Net flow" value={created - completed} invert subtitle="νέα μείον ολοκληρωμένα" />
        <KpiTile label="Εντός προθεσμίας" value={withDue === 0 ? '—' : Math.round(onTimeWeighted / withDue)} unit={withDue === 0 ? undefined : '%'} subtitle="βάσει tasks με προθεσμία" />
        <KpiTile label="Χρεώσιμες ώρες" value={Math.round(data.rows.reduce((sum, project) => sum + project.billableHours, 0) * 10) / 10} unit="h" subtitle="ολοκληρωμένων tasks περιόδου" />
        <KpiTile label="Εκπρόθεσμα τώρα" value={data.rows.reduce((sum, project) => sum + project.overdue, 0)} invert subtitle="snapshot ανοικτών tasks" />
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1320px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5 bg-fluent-neutral-4/40">
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-4 py-2.5 whitespace-nowrap" title={c.title}>
                  <button type="button" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-1 hover:text-fluent-neutral-90">
                    {c.label}{sort.key === c.key && (sort.dir === -1 ? <ArrowSortDown16Filled className="h-3 w-3" /> : <ArrowSortUp16Filled className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => <Row key={p.id} p={p} />)}
            {rows.length === 0 && <tr><td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-sm text-fluent-neutral-50">Κανένα έργο.</td></tr>}
          </tbody>
        </table>
      </div>
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
        <div className="flex items-center gap-2"><span className="flex-1 h-1.5 rounded-full bg-fluent-neutral-8 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${p.completionPct}%`, background: p.color }} /></span><span className="text-[11px] tabular-nums font-semibold w-8 text-right">{p.completionPct}%</span></div>
        <span className="text-[10px] text-fluent-neutral-50 tabular-nums">{p.done}/{p.total}</span>
      </td>
      <td className="px-4 py-3 tabular-nums font-semibold">{p.completedInPeriod}</td>
      <td className="px-4 py-3 tabular-nums">{p.velocityPerWeek}</td>
      <td className={cn('px-4 py-3 tabular-nums font-semibold', p.netFlow > 0 ? 'text-fluent-accent-orange' : 'text-fluent-neutral-70')}>{p.netFlow > 0 ? `+${p.netFlow}` : p.netFlow}</td>
      <td className="px-4 py-3 tabular-nums">{p.onTimePct === null ? '—' : `${p.onTimePct}%`}</td>
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{p.trackedHours}h <span className="text-fluent-neutral-50">/ {p.estimatedHours}h</span></td>
      <td className="px-4 py-3 tabular-nums">{p.billableHours}h</td>
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{p.laborCost.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}</td>
      <td className="px-4 py-3 tabular-nums">{p.avgCycleHours === null ? '—' : `${p.avgCycleHours}h`}{p.cycleN > 0 && p.cycleN < 5 && <span className="text-[10px] text-fluent-neutral-50 ml-1">n={p.cycleN}</span>}</td>
      <td className={cn('px-4 py-3 tabular-nums', p.overdue > 0 && 'text-fluent-accent-red font-semibold')}>{p.overdue}</td>
    </tr>
  );
}
