'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CalendarLtr20Regular, Flag16Filled } from '@fluentui/react-icons';
import { AvatarStack } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { RadarData, RadarSpan } from '@/lib/dashboard/types';

/**
 * Greedy lane packing: κάθε μπάρα μπαίνει στην πρώτη «λωρίδα» που δεν
 * επικαλύπτεται με την προηγούμενη μπάρα της λωρίδας.
 */
function packLanes(spans: RadarSpan[]): RadarSpan[][] {
  const lanes: RadarSpan[][] = [];
  const sorted = [...spans].sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);
  for (const s of sorted) {
    const lane = lanes.find((l) => l[l.length - 1].endCol < s.startCol);
    if (lane) lane.push(s);
    else lanes.push([s]);
  }
  return lanes;
}

export function RadarZone({ data }: { data: RadarData }) {
  const { days, spans } = data;
  const lanes = packLanes(spans);
  const hasDeadlines = days.some((d) => d.projectDeadlines.length > 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-5 py-4 border-b border-black/5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-fluent-blue-100 text-fluent-blue-700">
          <CalendarLtr20Regular className="h-4 w-4" />
        </span>
        <h2 className="font-display text-sm font-semibold text-fluent-neutral-95">Εβδομάδα με μια ματιά</h2>
        <span className="ml-auto text-[11px] text-fluent-neutral-50 tabular-nums">{spans.length} tasks</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-black/5">
            {days.map((d) => (
              <div
                key={d.dayIso}
                className={cn(
                  'px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide',
                  d.isToday ? 'text-fluent-blue-700' : 'text-fluent-neutral-50',
                  d.isWeekend && 'bg-fluent-neutral-4/70',
                )}
              >
                {d.isToday ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-fluent-blue-600" />
                    {d.label}
                  </span>
                ) : (
                  d.label
                )}
              </div>
            ))}
          </div>

          <div className="relative">
            <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
              {days.map((d) => (
                <div
                  key={d.dayIso}
                  className={cn(
                    'border-r border-black/[0.04] last:border-r-0',
                    d.isWeekend && 'bg-fluent-neutral-4/70',
                    d.isToday && 'bg-fluent-blue-50/40',
                  )}
                />
              ))}
            </div>

            {spans.length === 0 ? (
              <p className="relative py-8 text-center text-sm text-fluent-neutral-50">
                Καμία προθεσμία τις επόμενες 7 ημέρες.
              </p>
            ) : (
              <div className="relative py-3 space-y-2">
                {lanes.map((lane, li) => (
                  <div key={li} className="grid grid-cols-7" style={{ minHeight: 52 }}>
                    {lane.map((s) => (
                      <Link
                        key={s.id}
                        href={s.href}
                        title={`${s.title} · ${s.projectName}`}
                        style={{ gridColumn: `${s.startCol + 1} / ${s.endCol + 2}` }}
                        className="group mx-1 flex items-center gap-2 rounded-lg bg-white border border-black/5 shadow-fluent-2 pr-2 py-1.5 hover:shadow-fluent-8 hover:-translate-y-px transition-all overflow-hidden"
                      >
                        <span
                          className="self-stretch w-1.5 shrink-0 rounded-full my-0.5 ml-1"
                          style={{ background: s.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-fluent-neutral-90 group-hover:text-fluent-blue-700">
                            {s.title}
                          </span>
                          <span className="block truncate text-[10px] text-fluent-neutral-50">{s.rangeLabel}</span>
                        </span>
                        {s.assignees.length > 0 && (
                          <span className="shrink-0">
                            <AvatarStack users={s.assignees} max={3} size="xs" />
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasDeadlines && (
            <div className="grid grid-cols-7 border-t border-black/5">
              {days.map((d) => (
                <div key={d.dayIso} className={cn('px-1.5 py-1.5 min-h-[28px]', d.isWeekend && 'bg-fluent-neutral-4/70')}>
                  {d.projectDeadlines.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      title={`Deadline: ${p.name}`}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold hover:bg-fluent-neutral-6 truncate"
                      style={{ color: p.color }}
                    >
                      <Flag16Filled className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
