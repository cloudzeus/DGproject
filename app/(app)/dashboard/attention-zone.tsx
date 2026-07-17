'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TicketDiagonal20Regular,
  CheckmarkCircle20Regular,
  DocumentEdit20Regular,
  BookOpen20Regular,
  QuestionCircle20Regular,
  People20Regular,
  Timer20Regular,
  Warning20Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Sparkle20Regular,
} from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { updateTaskStatus } from '@/app/(app)/board/actions';
import {
  ResolutionDialog,
  checkResolutionPrompt,
  type ResolutionPromptInfo,
} from '@/components/tickets/resolution-dialog';
import type { AttentionItem } from '@/lib/dashboard/types';

// Οπτική ταυτότητα ανά τύπο: χρωματιστό icon container + ετικέτα.
const KIND_THEME: Record<
  AttentionItem['kind'],
  { icon: React.ComponentType<{ className?: string }>; box: string; label: string }
> = {
  ticket_new: { icon: TicketDiagonal20Regular, box: 'bg-orange-100 text-orange-600', label: 'Ticket' },
  ticket_reply: { icon: TicketDiagonal20Regular, box: 'bg-orange-100 text-orange-600', label: 'Απάντηση' },
  approval: { icon: CheckmarkCircle20Regular, box: 'bg-green-100 text-green-700', label: 'Έγκριση' },
  missing_resolution: { icon: DocumentEdit20Regular, box: 'bg-red-100 text-red-600', label: 'Λύση' },
  kb_draft: { icon: BookOpen20Regular, box: 'bg-teal-100 text-teal-700', label: 'Γνωσιακή βάση' },
  question: { icon: QuestionCircle20Regular, box: 'bg-purple-100 text-purple-600', label: 'Ερώτηση' },
  meeting_review: { icon: People20Regular, box: 'bg-fluent-blue-100 text-fluent-blue-700', label: 'Meeting AI' },
};

function AgeChip({ ageHours }: { ageHours: number }) {
  if (ageHours < 4) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-fluent-neutral-8 px-2 py-0.5 text-[11px] font-medium text-fluent-neutral-60">
        {ageHours < 1 ? '<1 ώρα' : `${ageHours.toFixed(1)} ώρες`}
      </span>
    );
  }
  if (ageHours < 24) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        <Timer20Regular className="h-3 w-3" />
        {Math.round(ageHours)} ώρες
      </span>
    );
  }
  const days = Math.round(ageHours / 24);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      <Warning20Regular className="h-3 w-3" />
      {days} {days === 1 ? 'ημέρα' : 'ημέρες'}
    </span>
  );
}

/** Ομαδοποίηση ίδιων ειδοποιήσεων (ίδιο kind + τίτλος, π.χ. 7 ερωτήσεις στο ίδιο task). */
type Grouped = { key: string; items: AttentionItem[] };
function groupItems(items: AttentionItem[]): Grouped[] {
  const map = new Map<string, AttentionItem[]>();
  for (const it of items) {
    const key = `${it.kind}::${it.title}`;
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return [...map.entries()].map(([key, its]) => ({ key, items: its }));
}

export function AttentionZone({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [resolutionPrompt, setResolutionPrompt] = useState<ResolutionPromptInfo | null>(null);

  function handleApprove(item: AttentionItem) {
    if (!item.taskId) return;
    setBusyId(item.id);
    startTransition(async () => {
      const res = await updateTaskStatus(item.taskId!, 'done');
      if (res && !res.ok) {
        if (res.error) alert(res.error);
        setBusyId(null);
        return;
      }
      router.refresh();
      if (item.ticket) {
        const info = await checkResolutionPrompt(item.taskId!);
        if (info) setResolutionPrompt(info);
      }
      setBusyId(null);
    });
  }

  function ActionButton({ item }: { item: AttentionItem }) {
    const isBusy = pending && busyId === item.id;
    if (item.action === 'approve') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleApprove(item)}
          className="rounded-md bg-fluent-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fluent-blue-700 disabled:opacity-50 transition-colors"
        >
          {isBusy ? 'Έγκριση…' : 'Έγκριση'}
        </button>
      );
    }
    if (item.action === 'write_resolution' && item.ticket) {
      return (
        <button
          type="button"
          onClick={() =>
            setResolutionPrompt({ ticketId: item.ticket!.id, code: item.ticket!.code, subject: item.ticket!.subject })
          }
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
        >
          Γράψε λύση
        </button>
      );
    }
    return (
      <Link
        href={item.href}
        className="rounded-md border border-fluent-neutral-20 bg-white px-3 py-1.5 text-xs font-medium text-fluent-neutral-80 hover:border-fluent-blue-300 hover:text-fluent-blue-700 transition-colors"
      >
        Άνοιγμα
      </Link>
    );
  }

  const groups = groupItems(items);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      {/* Χρωματική κορυφή — δίνει ταυτότητα στη σημαντικότερη κάρτα της σελίδας. */}
      <div className="h-1 bg-gradient-to-r from-fluent-blue-500 via-purple-500 to-orange-400" />
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fluent-blue-100 text-fluent-blue-700">
            <Sparkle20Regular />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-fluent-neutral-95 leading-tight">
              Χρειάζονται εσένα
            </h2>
            <p className="text-[11px] text-fluent-neutral-60">Ό,τι περιμένει δική σου ενέργεια</p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-fluent-blue-600 px-2 text-sm font-bold text-white tabular-nums">
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-fluent-neutral-60">
          Όλα καθαρά 🎉 — τίποτα δεν περιμένει εσένα.
        </div>
      ) : (
        <ul className="divide-y divide-black/5">
          {groups.map((g) => {
            const first = g.items[0];
            const theme = KIND_THEME[first.kind];
            const Icon = theme.icon;
            const worst = Math.max(...g.items.map((i) => i.ageHours));

            if (g.items.length === 1) {
              return (
                <li key={g.key} className="flex items-center gap-3 px-5 py-3 hover:bg-fluent-neutral-4/50 transition-colors">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', theme.box)}>
                    <Icon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('shrink-0 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide', theme.box)}>
                        {theme.label}
                      </span>
                      <Link href={first.href} className="truncate text-sm font-medium text-fluent-neutral-90 hover:text-fluent-blue-600">
                        {first.title}
                      </Link>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {first.subtitle && <span className="truncate text-xs text-fluent-neutral-60">{first.subtitle}</span>}
                      <AgeChip ageHours={first.ageHours} />
                    </div>
                  </div>
                  <ActionButton item={first} />
                </li>
              );
            }

            const open = openGroup === g.key;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : g.key)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-fluent-neutral-4/50 transition-colors"
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', theme.box)}>
                    <Icon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('shrink-0 rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide', theme.box)}>
                        {theme.label} × {g.items.length}
                      </span>
                      <span className="truncate text-sm font-medium text-fluent-neutral-90">{first.title}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-fluent-neutral-60">
                        {g.items.length} {first.kind === 'question' ? 'αναπάντητες ερωτήσεις' : 'στοιχεία'} στο ίδιο θέμα
                      </span>
                      <AgeChip ageHours={worst} />
                    </div>
                  </div>
                  <span className="shrink-0 text-fluent-neutral-50">
                    {open ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                  </span>
                </button>
                {open && (
                  <ul className="border-t border-black/[0.04] bg-fluent-neutral-4/40">
                    {g.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-2.5 pl-[68px] pr-5">
                        <div className="min-w-0 flex-1">
                          {item.subtitle && (
                            <span className="block truncate text-xs text-fluent-neutral-70">{item.subtitle}</span>
                          )}
                          <AgeChip ageHours={item.ageHours} />
                        </div>
                        <ActionButton item={item} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {resolutionPrompt && (
        <ResolutionDialog info={resolutionPrompt} onClose={() => setResolutionPrompt(null)} />
      )}
    </motion.section>
  );
}
