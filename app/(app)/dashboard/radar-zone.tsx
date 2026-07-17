'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Flag20Filled } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import type { RadarDay } from '@/lib/dashboard/types';

export function RadarZone({ days }: { days: RadarDay[] }) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const expanded = days.find((d) => d.dayIso === expandedDay) ?? null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15 }}
      className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-black/5">
        <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">Ραντάρ προθεσμιών</h2>
        <p className="text-xs text-fluent-neutral-60 mt-0.5">Επόμενες 7 ημέρες</p>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[640px] divide-x divide-black/5">
          {days.map((day) => (
            <button
              key={day.dayIso}
              type="button"
              onClick={() => setExpandedDay((cur) => (cur === day.dayIso ? null : day.dayIso))}
              className={cn(
                'flex flex-col text-left px-2 py-3 min-h-[140px] align-top hover:bg-fluent-neutral-4 transition-colors',
                expandedDay === day.dayIso && 'bg-fluent-blue-50/60',
              )}
            >
              <span
                className={cn(
                  'text-[11px] font-semibold capitalize mb-1.5 self-start rounded-full px-1.5 py-0.5',
                  day.isToday ? 'bg-fluent-blue-600 text-white' : 'text-fluent-neutral-70',
                )}
              >
                {day.label}
              </span>

              {day.tasks.length === 0 && day.projectDeadlines.length === 0 ? (
                <span className="text-xs text-fluent-neutral-40">—</span>
              ) : (
                <div className="flex flex-col gap-1 w-full">
                  {day.tasks.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      title={t.title}
                      className="flex items-center gap-1.5 text-[11px] text-fluent-neutral-80 truncate"
                    >
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: t.projectColor }} />
                      <span className="truncate">{t.title}</span>
                    </span>
                  ))}
                  {day.tasks.length > 4 && (
                    <span className="text-[10px] text-fluent-neutral-50">+{day.tasks.length - 4} ακόμη</span>
                  )}
                  {day.projectDeadlines.map((p) => (
                    <span
                      key={p.id}
                      title={`Προθεσμία έργου: ${p.name}`}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-fluent-accent-red truncate"
                    >
                      <Flag20Filled className="h-3 w-3 shrink-0" style={{ color: p.color }} />
                      <span className="truncate">{p.name}</span>
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-black/5 px-5 py-4 bg-fluent-neutral-4/50">
          <p className="text-xs font-semibold text-fluent-neutral-80 capitalize mb-2">{expanded.label}</p>
          {expanded.tasks.length === 0 && expanded.projectDeadlines.length === 0 ? (
            <p className="text-xs text-fluent-neutral-60">Καμία προθεσμία αυτή την ημέρα.</p>
          ) : (
            <ul className="space-y-1.5">
              {expanded.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: t.projectColor }} />
                  <Link href={t.href} className="min-w-0 flex-1 truncate text-fluent-neutral-90 hover:text-fluent-blue-600">
                    {t.title}
                  </Link>
                  <span className="shrink-0 text-xs text-fluent-neutral-50">{t.projectName}</span>
                </li>
              ))}
              {expanded.projectDeadlines.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <Flag20Filled className="h-4 w-4 shrink-0" style={{ color: p.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium text-fluent-accent-red">
                    Προθεσμία έργου: {p.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </motion.section>
  );
}
