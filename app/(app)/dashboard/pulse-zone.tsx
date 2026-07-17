'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Mail20Regular,
  TicketDiagonal20Regular,
  CheckmarkCircle20Regular,
  Warning20Regular,
  Timer20Regular,
  ArrowUp16Filled,
  ArrowDown16Filled,
} from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import type { PulseData } from '@/lib/dashboard/types';

/** Χρωματιστό KPI tile του dashboard — icon σε tinted container + accent τιμή. */
function DashKpi({
  label, value, unit, delta, invert, subtitle, icon: Icon, tone, href,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  invert?: boolean;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'blue' | 'green' | 'red' | 'violet';
  href: string;
}) {
  const tones = {
    blue: { box: 'bg-fluent-blue-100 text-fluent-blue-700', val: 'text-fluent-blue-700' },
    green: { box: 'bg-green-100 text-green-700', val: 'text-green-700' },
    red: { box: 'bg-red-100 text-red-600', val: 'text-red-600' },
    violet: { box: 'bg-purple-100 text-purple-700', val: 'text-purple-700' },
  }[tone];
  const showDelta = delta !== undefined && delta !== null;
  const good = showDelta && (invert ? delta! < 0 : delta! > 0);
  return (
    <Link
      href={href}
      className="block rounded-xl border border-black/5 bg-white p-3.5 shadow-fluent-2 hover:shadow-fluent-8 hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', tones.box)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-medium text-fluent-neutral-60 leading-tight">{label}</span>
      </div>
      <p className={cn('text-[26px] leading-8 font-bold tabular-nums', tones.val)}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-fluent-neutral-50">{unit}</span>}
      </p>
      <div className="mt-0.5 min-h-[14px] text-[11px]">
        {showDelta ? (
          <span className={cn('inline-flex items-center gap-0.5 font-semibold', good ? 'text-green-700' : delta === 0 ? 'text-fluent-neutral-50' : 'text-red-600')}>
            {delta! > 0 ? <ArrowUp16Filled className="h-3 w-3" /> : delta! < 0 ? <ArrowDown16Filled className="h-3 w-3" /> : null}
            {delta === 0 ? '±0%' : `${delta! > 0 ? '+' : ''}${delta}%`}
            <span className="font-normal text-fluent-neutral-50 ml-1">vs προηγ.</span>
          </span>
        ) : subtitle ? (
          <span className="text-fluent-neutral-50">{subtitle}</span>
        ) : null}
      </div>
    </Link>
  );
}

/** Ντετερμινιστικό χρώμα avatar από το όνομα. */
const AVATAR_TONES = ['bg-fluent-blue-500', 'bg-purple-500', 'bg-teal-600', 'bg-orange-500', 'bg-green-600', 'bg-pink-500'];
function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

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
          <DashKpi label="Ανοιχτά tickets" value={kpis.openTickets} icon={TicketDiagonal20Regular} tone="blue" href="/reports?tab=tickets" />
          <DashKpi
            label="Ολοκληρώσεις εβδομάδας"
            value={kpis.completedThisWeek.value}
            delta={kpis.completedThisWeek.delta}
            icon={CheckmarkCircle20Regular}
            tone="green"
            href="/reports?tab=tasks"
          />
          <DashKpi label="Εκπρόθεσμα σύνολο" value={kpis.overdueTotal} invert icon={Warning20Regular} tone="red" href="/reports?tab=tasks" />
          <DashKpi
            label="Μέσος χρόνος επίλυσης"
            value={kpis.avgResolutionHours.value ?? '—'}
            unit={kpis.avgResolutionHours.value !== null ? 'ώρες' : undefined}
            subtitle={
              kpis.avgResolutionHours.n > 0 && kpis.avgResolutionHours.n < 5
                ? `μόνο ${kpis.avgResolutionHours.n} tickets`
                : undefined
            }
            icon={Timer20Regular}
            tone="violet"
            href="/reports?tab=tickets"
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-black/5">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-fluent-neutral-95"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-100 text-orange-600"><Mail20Regular className="h-4 w-4" /></span>Εκκρεμή emails</h2>
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
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-fluent-neutral-95"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-100 text-teal-700"><Timer20Regular className="h-4 w-4" /></span>Δραστηριότητα</h2>
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
                <ul className="space-y-2">
                  {group.items.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-xs text-fluent-neutral-70">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white',
                          avatarTone(a.actorName),
                        )}
                        aria-hidden
                      >
                        {a.actorName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                      </span>
                      <span className="min-w-0">
                        <span className="font-semibold text-fluent-neutral-90">{a.actorName.split(' ')[0]}</span>{' '}
                        {a.text}
                      </span>
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
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-fluent-neutral-95"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-600"><CheckmarkCircle20Regular className="h-4 w-4" /></span>Θερμά projects</h2>
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
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
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
