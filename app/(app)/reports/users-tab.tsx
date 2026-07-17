'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown16Regular, ChevronRight16Regular, ArrowUp16Filled, ArrowDown16Filled } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ROLE_LABELS_EL, STATUS_LABELS_EL } from '@/lib/reports/shared';
import { DELTA } from '@/lib/reports/chart-theme';
import { WeeklyBars } from '@/components/reports/time-charts';
import type { UsersReport, UserReportRow } from '@/lib/reports/users';

export function UsersTab({ data }: { data: UsersReport }) {
  const [open, setOpen] = useState<string | null>(null);
  if (data.rows.length === 0) {
    return <p className="py-16 text-center text-sm text-fluent-neutral-50">Κανένας χρήστης.</p>;
  }
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-60 border-b border-black/5 bg-fluent-neutral-4/40">
            <th className="px-4 py-2.5 w-8" />
            <th className="px-4 py-2.5">Χρήστης</th>
            <th className="px-4 py-2.5">Ολοκλ. στην περίοδο</th>
            <th className="px-4 py-2.5">Ώρες tracked</th>
            <th className="px-4 py-2.5">Μ.ό. cycle</th>
            <th className="px-4 py-2.5">Εντός προθεσμίας</th>
            <th className="px-4 py-2.5">Ενεργός φόρτος</th>
            <th className="px-4 py-2.5">Εκπρόθεσμα</th>
            <th className="px-4 py-2.5">Tickets</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((u) => (
            <Fragment key={u.id}>
              <tr
                className="border-b border-black/[0.03] hover:bg-fluent-blue-50/30 cursor-pointer"
                onClick={() => setOpen(open === u.id ? null : u.id)}
              >
                <td className="px-4 py-3 text-fluent-neutral-50">
                  {open === u.id ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar user={{ name: u.name, avatarUrl: u.avatarUrl }} size="sm" />
                    <span>
                      <span className="block font-medium text-fluent-neutral-90">{u.name}</span>
                      <span className="block text-[11px] text-fluent-neutral-50">{ROLE_LABELS_EL[u.role] ?? u.role}</span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="tabular-nums font-semibold">{u.completedInPeriod}</span>
                  {u.completedDelta !== null && (
                    <span
                      className="ml-2 inline-flex items-center gap-0.5 text-[11px] font-semibold"
                      style={{ color: u.completedDelta === 0 ? DELTA.neutral : u.completedDelta > 0 ? DELTA.good : DELTA.bad }}
                    >
                      {u.completedDelta > 0 ? <ArrowUp16Filled className="h-3 w-3" /> : u.completedDelta < 0 ? <ArrowDown16Filled className="h-3 w-3" /> : null}
                      {Math.abs(u.completedDelta)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{u.trackedHours}h</td>
                <td className="px-4 py-3 tabular-nums">
                  {u.avgCycleHours === null ? '—' : `${u.avgCycleHours}h`}
                  {u.cycleN > 0 && u.cycleN < 5 && <span className="text-[10px] text-fluent-neutral-50 ml-1">n={u.cycleN}</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">{u.onTimePct === null ? '—' : `${u.onTimePct}%`}</td>
                <td className="px-4 py-3 tabular-nums">{u.activeLoad}</td>
                <td className={cn('px-4 py-3 tabular-nums', u.overdue > 0 && 'text-fluent-accent-red font-semibold')}>{u.overdue}</td>
                <td className="px-4 py-3 tabular-nums">{u.ticketsResolved}</td>
              </tr>
              {open === u.id && (
                <tr className="border-b border-black/[0.03] bg-fluent-neutral-4/30">
                  <td />
                  <td colSpan={8} className="px-4 py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div>
                        <p className="text-[11px] font-semibold text-fluent-neutral-60 uppercase tracking-wider mb-2">Ολοκληρώσεις ανά εβδομάδα</p>
                        {u.weeklyCompletions.every((w) => w.count === 0) ? (
                          <p className="text-sm text-fluent-neutral-50 py-4">Καμία ολοκλήρωση στην περίοδο.</p>
                        ) : (
                          <WeeklyBars data={u.weeklyCompletions} name="Ολοκληρώσεις" height={140} />
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-fluent-neutral-60 uppercase tracking-wider mb-2">Πρόσφατα tasks</p>
                        <ul className="space-y-1.5">
                          {u.recentTasks.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 text-xs">
                              <Link href={`/board?task=${t.id}`} className="font-medium text-fluent-neutral-90 hover:text-fluent-blue-600 truncate">
                                {t.title}
                              </Link>
                              <span className="text-fluent-neutral-50 shrink-0">
                                {t.projectName} · {STATUS_LABELS_EL[t.status] ?? t.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
