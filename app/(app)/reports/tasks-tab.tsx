'use client';
import Link from 'next/link';
import { KpiTile } from '@/components/reports/kpi-tile';
import { ChartCard } from '@/components/reports/chart-card';
import { WeeklyBars } from '@/components/reports/time-charts';
import { HBarList, StackedBar } from '@/components/reports/static-charts';
import { STATUS_LABELS_EL, PRIORITY_LABELS_EL } from '@/lib/reports/shared';
import { STATUS_SERIES } from '@/lib/reports/chart-theme';
import { cn } from '@/lib/utils';
import type { TasksReport } from '@/lib/reports/tasks';

/** Aging semantics: <7μ ήσυχο, 7–30μ warning, >30μ critical — icon+κείμενο, όχι μόνο χρώμα. */
function agingBadge(days: number) {
  if (days > 30) return { text: `${days} ημέρες`, cls: 'bg-red-100 text-red-700', icon: '⚠' };
  if (days > 7) return { text: `${days} ημέρες`, cls: 'bg-amber-100 text-amber-800', icon: '•' };
  return { text: `${days} ημέρες`, cls: 'bg-fluent-neutral-6 text-fluent-neutral-70', icon: '' };
}

export function TasksTab({ data }: { data: TasksReport }) {
  const throughputTotal = data.throughputByWeek.reduce((a, b) => a + b.count, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Ολοκληρώσεις στην περίοδο" value={throughputTotal} delta={data.throughputDelta} />
        <KpiTile
          label="Εντός προθεσμίας"
          value={data.onTimePct === null ? '—' : `${data.onTimePct}%`}
          subtitle={data.onTimeN > 0 && data.onTimeN < 5 ? `μόνο ${data.onTimeN} με προθεσμία` : undefined}
        />
        <KpiTile label="Tasks από meetings" value={data.meetingTasks.total} />
        <KpiTile label="Χρειάζονται έλεγχο (AI)" value={data.meetingTasks.needsReview} invert />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Κατανομή status"
          subtitle="Ανοιχτά τώρα + ολοκληρώσεις της περιόδου"
          empty={data.statusBreakdown.every((s) => s.count === 0)}
        >
          <StackedBar segments={data.statusBreakdown.map((s) => ({
            label: STATUS_LABELS_EL[s.status] ?? s.status, value: s.count, color: STATUS_SERIES[s.status],
          }))} />
        </ChartCard>
        <ChartCard title="Νέα tasks ανά προτεραιότητα" empty={data.priorityBreakdown.every((p) => p.count === 0)}>
          <HBarList items={data.priorityBreakdown.map((p) => ({ label: PRIORITY_LABELS_EL[p.priority] ?? p.priority, value: p.count }))} />
        </ChartCard>
        <ChartCard
          title="Throughput ανά εβδομάδα"
          empty={throughputTotal === 0}
          table={{ headers: ['Εβδομάδα', 'Ολοκληρώσεις'], rows: data.throughputByWeek.map((w) => [w.week, w.count]) }}
        >
          <WeeklyBars data={data.throughputByWeek} name="Ολοκληρώσεις" />
        </ChartCard>
        <ChartCard title="Κατανομή cycle time" subtitle="Δημιουργία → ολοκλήρωση" empty={data.cycleDistribution.every((c) => c.count === 0)}>
          <HBarList items={data.cycleDistribution.map((c) => ({ label: c.bucket, value: c.count }))} />
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
        <h3 className="text-sm font-semibold text-fluent-neutral-90 mb-3">Παλαιότερα ανοιχτά tasks</h3>
        {data.aging.length === 0 ? (
          <p className="py-6 text-center text-sm text-fluent-neutral-50">Κανένα ανοιχτό task.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5">
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Έργο</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Ανάθεση</th>
                  <th className="py-2">Ανοιχτό εδώ και</th>
                </tr>
              </thead>
              <tbody>
                {data.aging.map((t) => {
                  const b = agingBadge(t.daysOpen);
                  return (
                    <tr key={t.id} className="border-b border-black/[0.03] last:border-0 hover:bg-fluent-blue-50/30">
                      <td className="py-2.5 pr-3 max-w-xs">
                        <Link href={`/board?task=${t.id}`} className="font-medium text-fluent-neutral-90 hover:text-fluent-blue-600 line-clamp-1">
                          {t.title}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-fluent-neutral-70 whitespace-nowrap">{t.projectName}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-xs">{STATUS_LABELS_EL[t.status] ?? t.status}</td>
                      <td className="py-2.5 pr-3 text-xs text-fluent-neutral-60">{t.assignees.join(', ') || '—'}</td>
                      <td className="py-2.5">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', b.cls)}>
                          {b.icon} {b.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
