'use client';
import { KpiTile } from '@/components/reports/kpi-tile';
import { ChartCard } from '@/components/reports/chart-card';
import { TrendArea, WeeklyBars } from '@/components/reports/time-charts';
import { HBarList, StackedBar } from '@/components/reports/static-charts';
import { TICKET_STATUS_GROUPS, CATEGORICAL } from '@/lib/reports/chart-theme';
import type { TicketsReport } from '@/lib/reports/tickets';

function TimeStat({ label, t }: { label: string; t: { mean: number | null; median: number | null; n: number } }) {
  return (
    <KpiTile
      label={label}
      value={t.median ?? '—'}
      unit={t.median !== null ? 'ώρες (median)' : undefined}
      subtitle={t.n === 0 ? undefined : `μ.ό. ${t.mean}h · ${t.n} tickets${t.n < 5 ? ' ⚠ λίγα δεδομένα' : ''}`}
    />
  );
}

export function TicketsTab({ data }: { data: TicketsReport }) {
  const groups = TICKET_STATUS_GROUPS.map((g) => ({
    label: g.label,
    color: g.color,
    value: data.volume.byStatusGroup.find((x) => x.key === g.key)?.value ?? 0,
  }));
  const conversionPct = data.ai.convertedTotal === 0 ? null : Math.round((data.ai.acceptedSuggestion / data.ai.convertedTotal) * 100);
  return (
    <div className="space-y-5">
      {/* Χρόνοι */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Σύνολο tickets" value={data.volume.total} />
        <TimeStat label="Έως triage" t={data.times.toTriage} />
        <TimeStat label="Έως μετατροπή σε task" t={data.times.toConvert} />
        <TimeStat label="Έως επίλυση" t={data.times.toResolve} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Εισερχόμενα ανά ημέρα"
          empty={data.volume.incomingByDay.every((d) => d.value === 0)}
          table={{ headers: ['Ημέρα', 'Tickets'], rows: data.volume.incomingByDay.map((d) => [d.day, d.value]) }}
        >
          <TrendArea data={data.volume.incomingByDay} name="Εισερχόμενα" color={CATEGORICAL[1]} />
        </ChartCard>
        <ChartCard title="Επιλύσεις ανά εβδομάδα" empty={data.times.resolutionByWeek.every((w) => w.count === 0)}>
          <WeeklyBars data={data.times.resolutionByWeek} name="Επιλύσεις" color={CATEGORICAL[3]} />
        </ChartCard>
        <ChartCard title="Ανά πηγή" empty={data.volume.bySource.length === 0}>
          <HBarList items={data.volume.bySource} />
        </ChartCard>
        <ChartCard title="Ανά κατηγορία (AI)" empty={data.volume.byCategory.length === 0}>
          <HBarList items={data.volume.byCategory} />
        </ChartCard>
      </div>

      <ChartCard title="Κατάσταση tickets" subtitle="Όλα τα tickets της περιόδου" empty={data.volume.total === 0}>
        <StackedBar segments={groups} />
      </ChartCard>

      {/* AI ποιότητα */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Μέσο confidence AI" value={data.ai.avgConfidence === null ? '—' : `${data.ai.avgConfidence}%`} />
        <KpiTile
          label="Αποδοχή πρότασης project"
          value={conversionPct === null ? '—' : `${conversionPct}%`}
          subtitle={data.ai.convertedTotal > 0 ? `${data.ai.acceptedSuggestion}/${data.ai.convertedTotal} μετατροπές` : undefined}
        />
        <KpiTile label="Needs info" value={`${data.ai.needsInfoPct}%`} invert />
        <KpiTile label="Σφάλματα ανάλυσης" value={data.ai.errors} invert />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Κατανομή confidence" empty={data.ai.confidenceBuckets.every((b) => b.value === 0)}>
          <HBarList items={data.ai.confidenceBuckets} />
        </ChartCard>
        <ChartCard title="Απορρίψεις / Συγχωνεύσεις" empty={data.volume.total === 0}>
          <HBarList items={[
            { label: 'Απορρίφθηκαν', value: Math.round((data.ai.rejectedPct / 100) * data.volume.total) },
            { label: 'Συγχωνεύθηκαν', value: Math.round((data.ai.mergedPct / 100) * data.volume.total) },
          ]} />
        </ChartCard>
      </div>

      {/* Reporters */}
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
        <h3 className="text-sm font-semibold text-fluent-neutral-90 mb-1">Top reporters</h3>
        <p className="text-[11px] text-fluent-neutral-50 mb-3">Reporters με ≥3 tickets είναι υποψήφιοι για άρθρο στο Knowledge Base.</p>
        {data.reporters.length === 0 ? (
          <p className="py-6 text-center text-sm text-fluent-neutral-50">Κανένα ticket στην περίοδο.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5">
                <th className="py-2 pr-3">Reporter</th>
                <th className="py-2 pr-3">Tickets</th>
                <th className="py-2">Συχνότερη κατηγορία</th>
              </tr>
            </thead>
            <tbody>
              {data.reporters.map((r) => (
                <tr key={r.email} className="border-b border-black/[0.03] last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-fluent-neutral-90">{r.name ?? r.email}</span>
                    {r.name && <span className="text-xs text-fluent-neutral-50 ml-2">{r.email}</span>}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums font-semibold">
                    {r.count}
                    {r.count >= 3 && <span className="ml-2 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold">KB</span>}
                  </td>
                  <td className="py-2.5 text-fluent-neutral-70">{r.topCategory ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
