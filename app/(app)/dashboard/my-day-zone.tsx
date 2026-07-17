'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronDown16Regular, Clock20Regular } from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { updateTaskStatus } from '@/app/(app)/board/actions';
import {
  ResolutionDialog,
  checkResolutionPrompt,
  type ResolutionPromptInfo,
} from '@/components/tickets/resolution-dialog';
import type { MyDayData } from '@/lib/dashboard/types';

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}λ`;
  return `${hours}ω ${minutes}λ`;
}

function InProgressRow({
  item,
  onComplete,
  busy,
}: {
  item: MyDayData['inProgress'][number];
  onComplete: (item: MyDayData['inProgress'][number]) => void;
  busy: boolean;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const elapsedMs =
    item.accumulatedMs + (item.startedAtIso ? Date.now() - new Date(item.startedAtIso).getTime() : 0);

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-fluent-blue-50 flex items-center justify-center text-fluent-blue-600">
        <Clock20Regular />
      </div>
      <div className="min-w-0 flex-1">
        <Link href={item.href} className="block truncate text-sm font-medium text-fluent-neutral-90 hover:text-fluent-blue-600">
          {item.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-fluent-neutral-60">
          <span className="truncate">{item.projectName}</span>
          <span className="tabular-nums font-medium text-fluent-blue-600">{formatDuration(elapsedMs)}</span>
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onComplete(item)}
        className="shrink-0 rounded-md bg-fluent-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50"
      >
        {busy ? 'Ολοκλήρωση…' : 'Ολοκλήρωση'}
      </button>
    </li>
  );
}

export function MyDayZone({ data }: { data: MyDayData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tomorrowOpen, setTomorrowOpen] = useState(false);
  const [resolutionPrompt, setResolutionPrompt] = useState<ResolutionPromptInfo | null>(null);

  function handleComplete(item: MyDayData['inProgress'][number]) {
    setBusyId(item.id);
    startTransition(async () => {
      const res = await updateTaskStatus(item.id, 'done');
      if (res && !res.ok) {
        if (res.error) alert(res.error);
        setBusyId(null);
        return;
      }
      router.refresh();
      if (item.fromTicket) {
        const info = await checkResolutionPrompt(item.id);
        if (info) setResolutionPrompt(info);
      }
      setBusyId(null);
    });
  }

  const hasToday = data.today.length > 0;
  const hasInProgress = data.inProgress.length > 0;
  const hasOverdue = data.overdue.length > 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-black/5">
        <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">Η μέρα μου</h2>
      </div>

      {/* Σήμερα */}
      <div className="border-b border-black/5">
        <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
          Σήμερα
        </div>
        {hasToday ? (
          <ul className="divide-y divide-black/5">
            {data.today.map((t) => (
              <li key={`${t.kind}-${t.id}`} className="flex items-center gap-3 px-5 py-2.5">
                <div className="w-11 shrink-0 text-xs font-medium tabular-nums text-fluent-neutral-60">
                  {t.time ?? '—'}
                </div>
                <Link href={t.href} className="min-w-0 flex-1 truncate text-sm text-fluent-neutral-90 hover:text-fluent-blue-600">
                  {t.title}
                </Link>
                {t.projectName && (
                  <span className="shrink-0 text-xs text-fluent-neutral-50 truncate max-w-[120px]">{t.projectName}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 pb-3 text-xs text-fluent-neutral-60">Τίποτα για σήμερα.</div>
        )}
      </div>

      {/* Αύριο */}
      <div className="border-b border-black/5">
        <button
          type="button"
          onClick={() => setTomorrowOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-2.5 text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
            Αύριο {data.tomorrow.length > 0 && `· ${data.tomorrow.length}`}
          </span>
          {data.tomorrow.length > 0 && (
            <ChevronDown16Regular
              className={cn('transition-transform text-fluent-neutral-50', tomorrowOpen && 'rotate-180')}
            />
          )}
        </button>
        {tomorrowOpen && data.tomorrow.length > 0 && (
          <ul className="divide-y divide-black/5">
            {data.tomorrow.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                <Link href={t.href} className="min-w-0 flex-1 truncate text-sm text-fluent-neutral-90 hover:text-fluent-blue-600">
                  {t.title}
                </Link>
                {t.projectName && (
                  <span className="shrink-0 text-xs text-fluent-neutral-50 truncate max-w-[120px]">{t.projectName}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Σε εξέλιξη τώρα */}
      {hasInProgress && (
        <div className="border-b border-black/5">
          <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
            Σε εξέλιξη τώρα
          </div>
          <ul className="divide-y divide-black/5">
            {data.inProgress.map((item) => (
              <InProgressRow
                key={item.id}
                item={item}
                busy={pending && busyId === item.id}
                onComplete={handleComplete}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Εκπρόθεσμα */}
      {hasOverdue && (
        <div>
          <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
            Εκπρόθεσμα
          </div>
          <ul className="divide-y divide-black/5">
            {data.overdue.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                <Link href={t.href} className="min-w-0 flex-1 truncate text-sm text-fluent-neutral-90 hover:text-fluent-blue-600">
                  {t.title}
                </Link>
                <span className="shrink-0 text-xs text-fluent-neutral-50 truncate max-w-[120px]">{t.projectName}</span>
                <span className="shrink-0 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-fluent-accent-red">
                  {t.daysLate} {t.daysLate === 1 ? 'ημέρα' : 'ημέρες'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasToday && !hasInProgress && !hasOverdue && data.tomorrow.length === 0 && (
        <div className="px-5 py-6 text-center text-sm text-fluent-neutral-60">Καμία εργασία σήμερα.</div>
      )}

      {resolutionPrompt && (
        <ResolutionDialog info={resolutionPrompt} onClose={() => setResolutionPrompt(null)} />
      )}
    </motion.section>
  );
}
