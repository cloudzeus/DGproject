'use client';
import { KpiTile } from '@/components/reports/kpi-tile';
import { ChartCard } from '@/components/reports/chart-card';
import { TrendArea, DualBars } from '@/components/reports/time-charts';
import type { OverviewReport } from '@/lib/reports/overview';

export function OverviewTab({ data }: { data: OverviewReport }) {
  const k = data.kpis;
  const flowEmpty = data.ticketFlowByDay.every((d) => d.a === 0 && d.b === 0);
  const doneEmpty = data.taskCompletionsByDay.every((d) => d.value === 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile label="Ολοκληρωμένα tasks" value={k.tasksCompleted.value} delta={k.tasksCompleted.delta} spark={k.tasksCompleted.spark} />
        <KpiTile label="Νέα tickets" value={k.ticketsNew.value} delta={k.ticketsNew.delta} invert spark={k.ticketsNew.spark} />
        <KpiTile label="Επιλυμένα tickets" value={k.ticketsResolved.value} delta={k.ticketsResolved.delta} />
        <KpiTile
          label="Μέσος χρόνος επίλυσης"
          value={k.avgResolutionHours.value ?? '—'}
          unit={k.avgResolutionHours.value !== null ? 'ώρες' : undefined}
          subtitle={k.avgResolutionHours.n > 0 && k.avgResolutionHours.n < 5 ? `μόνο ${k.avgResolutionHours.n} tickets` : undefined}
        />
        <KpiTile label="Εκπρόθεσμα τώρα" value={k.overdueNow} subtitle="snapshot" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Ολοκληρώσεις tasks ανά ημέρα"
          empty={doneEmpty}
          table={{ headers: ['Ημέρα', 'Ολοκληρώσεις'], rows: data.taskCompletionsByDay.map((d) => [d.day, d.value]) }}
        >
          <TrendArea data={data.taskCompletionsByDay} name="Ολοκληρώσεις" />
        </ChartCard>
        <ChartCard
          title="Ροή tickets ανά ημέρα"
          empty={flowEmpty}
          table={{ headers: ['Ημέρα', 'Εισερχόμενα', 'Επιλυμένα'], rows: data.ticketFlowByDay.map((d) => [d.day, d.a, d.b]) }}
        >
          <DualBars data={data.ticketFlowByDay} aName="Εισερχόμενα" bName="Επιλυμένα" />
        </ChartCard>
      </div>
    </div>
  );
}
