'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail20Regular } from '@fluentui/react-icons';
import { KpiTile } from '@/components/reports/kpi-tile';
import { cn } from '@/lib/utils';
import type { PulseData } from '@/lib/dashboard/types';

const DAY_FMT = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' });

function dayLabel(dayIso: string, todayIso: string, yesterdayIso: string): string {
  if (dayIso === todayIso) return 'Σήμερα';
  if (dayIso === yesterdayIso) return 'Χθες';
  return DAY_FMT.format(new Date(`${dayIso}T00:00:00`));
}

export function PulseZone({ data }: { data: PulseData }) {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const yesterdayIso = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const groupedActivity: { dayIso: string; items: PulseData['activity'] }[] = [];
  for (const item of data.activity) {
    const group = groupedActivity.find((g) => g.dayIso === item.dayIso);
    if (group) group.items.push(item);
    else groupedActivity.push({ dayIso: item.dayIso, items: [item] });
  }

  const { kpis } = data;

  return (
    <div className="flex flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Link href="/reports?tab=tickets">
            <KpiTile label="Ανοιχτά tickets" value={kpis.openTickets} />
          </Link>
          <Link href="/reports?tab=tasks">
            <KpiTile
              label="Ολοκληρώσεις εβδομάδας"
              value={kpis.completedThisWeek.value}
              delta={kpis.completedThisWeek.delta}
            />
          </Link>
          <Link href="/reports?tab=tasks">
            <KpiTile label="Εκπρόθεσμα σύνολο" value={kpis.overdueTotal} invert />
          </Link>
          <Link href="/reports?tab=tickets">
            <KpiTile
              label="Μέσος χρόνος επίλυσης"
              value={kpis.avgResolutionHours.value ?? '—'}
              unit={kpis.avgResolutionHours.value !== null ? 'ω' : undefined}
              subtitle={
                kpis.avgResolutionHours.n > 0 && kpis.avgResolutionHours.n < 5
                  ? `μόνο ${kpis.avgResolutionHours.n} tickets`
                  : undefined
              }
            />
          </Link>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-black/5">
          <h2 className="font-display text-sm font-semibold text-fluent-neutral-95">Εκκρεμή emails</h2>
        </div>
        {data.pendingEmails.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-fluent-neutral-60">Κανένα εκκρεμές email.</div>
        ) : (
          <ul className="divide-y divide-black/5">
            {data.pendingEmails.map((e) => (
              <li key={e.id}>
                <Link href={`/projects/${e.projectId}`} className="flex items-start gap-2.5 px-5 py-2.5 hover:bg-fluent-neutral-4">
                  <Mail20Regular className="h-4 w-4 mt-0.5 shrink-0 text-fluent-neutral-50" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fluent-neutral-90">{e.subject}</p>
                    <p className="truncate text-[11px] text-fluent-neutral-50">{e.projectName}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-black/5">
          <h2 className="font-display text-sm font-semibold text-fluent-neutral-95">Δραστηριότητα</h2>
        </div>
        {groupedActivity.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-fluent-neutral-60">Καμία πρόσφατη δραστηριότητα.</div>
        ) : (
          <div className="divide-y divide-black/5">
            {groupedActivity.map((group) => (
              <div key={group.dayIso} className="px-5 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50 mb-1.5">
                  {dayLabel(group.dayIso, todayIso, yesterdayIso)}
                </p>
                <ul className="space-y-1.5">
                  {group.items.map((a) => (
                    <li key={a.id} className="text-xs text-fluent-neutral-70">
                      <span className="font-medium text-fluent-neutral-90">{a.actorName}</span> {a.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-black/5">
          <h2 className="font-display text-sm font-semibold text-fluent-neutral-95">Θερμά projects</h2>
        </div>
        {data.hotProjects.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-fluent-neutral-60">Καμία δραστηριότητα σε έργα.</div>
        ) : (
          <ul className="divide-y divide-black/5">
            {data.hotProjects.map((p) => {
              const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="block px-5 py-3 hover:bg-fluent-neutral-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="truncate text-sm font-medium text-fluent-neutral-90">{p.name}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-fluent-neutral-50 tabular-nums">
                        {p.done}/{p.total}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-fluent-neutral-10 overflow-hidden">
                      <div
                        className={cn('h-full transition-all bg-fluent-blue-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
