'use client';
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowSortDown16Filled,
  ArrowSortUp16Filled,
  ChevronDown16Regular,
  ChevronRight16Regular,
} from '@fluentui/react-icons';
import { ChartCard } from '@/components/reports/chart-card';
import { KpiTile } from '@/components/reports/kpi-tile';
import { WeeklyBars } from '@/components/reports/time-charts';
import { STATUS_LABELS_EL } from '@/lib/reports/shared';
import { cn } from '@/lib/utils';
import type { CustomerReportRow, CustomersReport } from '@/lib/reports/customers';

type SortKey = 'name' | 'activeProjects' | 'createdInPeriod' | 'completedInPeriod' | 'completionPct' | 'netFlow' | 'open' | 'overdue' | 'onTimePct' | 'avgCycleHours' | 'trackedHours' | 'billableHours';

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'name', label: 'Πελάτης' },
  { key: 'activeProjects', label: 'Έργα (ενεργά/σύνολο)' },
  { key: 'createdInPeriod', label: 'Νέα tasks' },
  { key: 'completedInPeriod', label: 'Ολοκληρώσεις' },
  { key: 'completionPct', label: 'Πρόοδος' },
  { key: 'netFlow', label: 'Net flow', title: 'Νέα tasks μείον ολοκληρώσεις στην περίοδο' },
  { key: 'open', label: 'Ανοιχτά' },
  { key: 'overdue', label: 'Εκπρόθεσμα' },
  { key: 'onTimePct', label: 'Εντός προθεσμίας', title: 'Ολοκληρώσεις περιόδου με προθεσμία' },
  { key: 'avgCycleHours', label: 'Μ.ό. cycle' },
  { key: 'trackedHours', label: 'Ώρες (πραγμ./εκτ.)' },
  { key: 'billableHours', label: 'Χρεώσιμες ώρες', title: 'Χρεώσιμες ώρες tasks που ολοκληρώθηκαν στην περίοδο' },
];

export function CustomersTab({ data }: { data: CustomersReport }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'completedInPeriod', dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const result = [...data.rows];
    result.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === 'string' && typeof bv === 'string') return sort.dir * av.localeCompare(bv, 'el');
      return sort.dir * (Number(av ?? -1) - Number(bv ?? -1));
    });
    return result;
  }, [data.rows, sort]);
  const k = data.summary;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
        <KpiTile label="Ενεργοί πελάτες" value={`${k.activeCustomers}/${k.customers}`} subtitle="με συσχετισμένα έργα" />
        <KpiTile label="Ενεργά έργα" value={k.activeProjects} subtitle={`${k.createdInPeriod} νέα tasks στην περίοδο`} />
        <KpiTile label="Ολοκληρώσεις" value={k.completedInPeriod} delta={k.completedDelta} spark={data.weeklyCompletions.map((week) => week.count)} />
        <KpiTile label="Εντός προθεσμίας" value={k.onTimePct === null ? '—' : k.onTimePct} unit={k.onTimePct === null ? undefined : '%'} subtitle="με καταχωρισμένη προθεσμία" />
        <KpiTile label="Χρεώσιμες ώρες" value={k.billableHours} unit="h" subtitle="ολοκληρωμένων tasks περιόδου" />
        <KpiTile label="Εκπρόθεσμα τώρα" value={k.overdue} invert subtitle="snapshot ανοικτών tasks" />
      </div>

      <ChartCard
        title="Ολοκληρώσεις πελατών ανά εβδομάδα"
        subtitle="Συνολικό throughput όλων των έργων με κύριο πελάτη"
        empty={data.weeklyCompletions.every((week) => week.count === 0)}
        table={{ headers: ['Εβδομάδα', 'Ολοκληρώσεις'], rows: data.weeklyCompletions.map((week) => [week.week, week.count]) }}
      >
        <WeeklyBars data={data.weeklyCompletions} name="Ολοκληρώσεις" height={210} />
      </ChartCard>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-x-auto">
        <table className="w-full text-sm min-w-[1500px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5 bg-fluent-neutral-4/40">
              <th className="px-3 py-2.5 w-8" />
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-4 py-2.5 whitespace-nowrap" title={column.title}>
                  <button
                    type="button"
                    onClick={() => setSort((current) => ({ key: column.key, dir: current.key === column.key ? (current.dir === 1 ? -1 : 1) : -1 }))}
                    className="inline-flex items-center gap-1 hover:text-fluent-neutral-90"
                  >
                    {column.label}
                    {sort.key === column.key && (sort.dir === -1 ? <ArrowSortDown16Filled className="h-3 w-3" /> : <ArrowSortUp16Filled className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <Fragment key={customer.id}>
                <CustomerRow customer={customer} expanded={open === customer.id} onToggle={() => setOpen(open === customer.id ? null : customer.id)} />
                {open === customer.id && (
                  <tr className="border-b border-black/[0.03] bg-fluent-neutral-4/30">
                    <td />
                    <td colSpan={COLUMNS.length} className="px-4 py-4">
                      <p className="text-[11px] font-semibold text-fluent-neutral-60 uppercase tracking-wider mb-2">Έργα πελάτη</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                        {customer.projects.map((project) => (
                          <Link key={project.id} href={`/projects/${project.id}`} className="group rounded-lg border border-black/5 bg-white px-3 py-2.5 hover:border-fluent-blue-300 shadow-fluent-2">
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: project.color }} />
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-fluent-neutral-90 group-hover:text-fluent-blue-600">{project.name}</span>
                              <span className="text-[10px] text-fluent-neutral-50">{STATUS_LABELS_EL[project.status] ?? project.status}</span>
                            </span>
                            <span className="mt-2 flex items-center gap-2">
                              <span className="flex-1 h-1.5 rounded-full bg-fluent-neutral-8 overflow-hidden">
                                <span className="block h-full rounded-full" style={{ width: `${project.completionPct}%`, background: project.color }} />
                              </span>
                              <span className="text-[10px] tabular-nums text-fluent-neutral-60">{project.done}/{project.total} · {project.open} ανοιχτά</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 1} className="px-4 py-16 text-center text-sm text-fluent-neutral-50">Δεν υπάρχουν έργα με συσχετισμένο κύριο πελάτη.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerRow({ customer, expanded, onToggle }: { customer: CustomerReportRow; expanded: boolean; onToggle: () => void }) {
  return (
    <tr className="border-b border-black/[0.03] last:border-0 hover:bg-fluent-blue-50/30">
      <td className="px-3 py-3 text-fluent-neutral-50">
        <button type="button" onClick={onToggle} aria-label={expanded ? `Απόκρυψη έργων ${customer.name}` : `Προβολή έργων ${customer.name}`} className="flex h-7 w-7 items-center justify-center rounded hover:bg-fluent-neutral-6">
          {expanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
        </button>
      </td>
      <td className="px-4 py-3 min-w-[210px]">
        <button type="button" onClick={onToggle} className="text-left">
          <span className="block font-medium text-fluent-neutral-90 hover:text-fluent-blue-600">{customer.name}</span>
          <span className={cn('text-[10px]', customer.isActive ? 'text-fluent-neutral-50' : 'text-fluent-accent-orange')}>{customer.isActive ? 'Ενεργός πελάτης' : 'Ανενεργός πελάτης'}</span>
        </button>
      </td>
      <td className="px-4 py-3 tabular-nums">{customer.activeProjects}/{customer.totalProjects}</td>
      <td className="px-4 py-3 tabular-nums">{customer.createdInPeriod}</td>
      <td className="px-4 py-3 tabular-nums font-semibold">{customer.completedInPeriod}</td>
      <td className="px-4 py-3 w-32">
        <div className="flex items-center gap-2">
          <span className="flex-1 h-1.5 rounded-full bg-fluent-neutral-8 overflow-hidden"><span className="block h-full rounded-full bg-fluent-blue-500" style={{ width: `${customer.completionPct}%` }} /></span>
          <span className="text-[11px] tabular-nums font-semibold">{customer.completionPct}%</span>
        </div>
        <span className="text-[10px] text-fluent-neutral-50 tabular-nums">{customer.done}/{customer.total}</span>
      </td>
      <td className={cn('px-4 py-3 tabular-nums font-semibold', customer.netFlow > 0 ? 'text-fluent-accent-orange' : 'text-fluent-neutral-70')}>{customer.netFlow > 0 ? `+${customer.netFlow}` : customer.netFlow}</td>
      <td className="px-4 py-3 tabular-nums">{customer.open}</td>
      <td className={cn('px-4 py-3 tabular-nums', customer.overdue > 0 && 'text-fluent-accent-red font-semibold')}>{customer.overdue}</td>
      <td className="px-4 py-3 tabular-nums">{customer.onTimePct === null ? '—' : `${customer.onTimePct}%`}</td>
      <td className="px-4 py-3 tabular-nums">{customer.avgCycleHours === null ? '—' : `${customer.avgCycleHours}h`}{customer.cycleN > 0 && customer.cycleN < 5 && <span className="text-[10px] text-fluent-neutral-50 ml-1">n={customer.cycleN}</span>}</td>
      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{customer.trackedHours}h <span className="text-fluent-neutral-50">/ {customer.estimatedHours}h</span></td>
      <td className="px-4 py-3 tabular-nums font-semibold">{customer.billableHours}h</td>
    </tr>
  );
}
