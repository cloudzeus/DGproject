'use client';

import { useEffect, useState } from 'react';
import { Timer20Regular } from '@fluentui/react-icons';
import { computeSpentMs, formatSpent } from '@/lib/task-in-progress-timer';

type Status = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

/**
 * Renders the wall-clock time a task has spent in status=in_progress.
 *
 * When the task is currently in_progress, the badge ticks every 60s so the
 * UI keeps up with the elapsed clock without a server round-trip. Otherwise
 * it renders a static value.
 *
 * Hidden entirely when nothing has been accumulated yet AND the task is not
 * currently in progress — keeps the card chrome quiet for fresh tasks.
 */
export function SpentTimeBadge({
  status,
  inProgressStartedAt,
  inProgressAccumulatedMs,
  estimatedHours,
  size = 'sm',
  showLabel = false,
  className = '',
}: {
  status: Status;
  inProgressStartedAt: Date | null;
  inProgressAccumulatedMs: number;
  estimatedHours?: number | null;
  size?: 'xs' | 'sm';
  showLabel?: boolean;
  className?: string;
}) {
  const isLive = status === 'in_progress' && !!inProgressStartedAt;

  // Live re-render every minute when the clock is ticking, so the badge
  // refreshes without a router.refresh() round trip.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [isLive]);

  const spentMs = computeSpentMs(status, inProgressStartedAt, inProgressAccumulatedMs, now);
  if (spentMs <= 0 && !isLive) return null;

  const estimateMs = estimatedHours && estimatedHours > 0
    ? estimatedHours * 60 * 60 * 1000
    : null;
  const overBudget = estimateMs !== null && spentMs > estimateMs;

  const text = formatSpent(spentMs);
  const ratio = estimateMs ? `/ ${formatSpent(estimateMs)}` : '';

  const sizeClass =
    size === 'xs'
      ? 'h-5 px-1.5 text-[10px] gap-1'
      : 'h-6 px-2 text-[11px] gap-1.5';
  const iconClass = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const tone = overBudget
    ? 'bg-fluent-accent-red/10 text-fluent-accent-red border-fluent-accent-red/20'
    : isLive
    ? 'bg-fluent-accent-green/10 text-fluent-accent-green border-fluent-accent-green/20'
    : 'bg-fluent-neutral-8 text-fluent-neutral-70 border-fluent-neutral-10';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium tabular-nums ${sizeClass} ${tone} ${className}`}
      title={
        overBudget
          ? `Έχει ξεπεράσει την εκτίμηση (${formatSpent(spentMs)} / ${formatSpent(estimateMs!)})`
          : isLive
          ? 'Σε επεξεργασία — μετράει'
          : `Συνολικός χρόνος σε επεξεργασία: ${formatSpent(spentMs)}`
      }
    >
      <Timer20Regular className={`${iconClass} ${isLive ? 'animate-pulse' : ''}`} />
      {showLabel && <span className="opacity-70">Spent</span>}
      <span>
        {text}
        {ratio && <span className="opacity-60 ml-0.5">{ratio}</span>}
      </span>
    </span>
  );
}
