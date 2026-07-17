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
} from '@fluentui/react-icons';
import { cn } from '@/lib/utils';
import { updateTaskStatus } from '@/app/(app)/board/actions';
import {
  ResolutionDialog,
  checkResolutionPrompt,
  type ResolutionPromptInfo,
} from '@/components/tickets/resolution-dialog';
import type { AttentionItem } from '@/lib/dashboard/types';

const KIND_ICON: Record<AttentionItem['kind'], React.ComponentType> = {
  ticket_new: TicketDiagonal20Regular,
  ticket_reply: TicketDiagonal20Regular,
  approval: CheckmarkCircle20Regular,
  missing_resolution: DocumentEdit20Regular,
  kb_draft: BookOpen20Regular,
  question: QuestionCircle20Regular,
  meeting_review: People20Regular,
};

const ACTION_LABEL: Record<NonNullable<AttentionItem['action']>, string> = {
  open: 'Άνοιγμα',
  approve: 'Έγκριση',
  write_resolution: 'Γράψε λύση',
};

function AgeChip({ ageHours }: { ageHours: number }) {
  if (ageHours < 4) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-fluent-neutral-8 px-2 py-0.5 text-[11px] font-medium text-fluent-neutral-60">
        {ageHours < 1 ? '<1 ώρα' : `${ageHours.toFixed(1)} ώρες`}
      </span>
    );
  }
  if (ageHours < 24) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <Timer20Regular className="h-3 w-3" />
        {Math.round(ageHours)} ώρες
      </span>
    );
  }
  const days = Math.round(ageHours / 24);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-fluent-accent-red">
      <Warning20Regular className="h-3 w-3" />
      {days} {days === 1 ? 'ημέρα' : 'ημέρες'}
    </span>
  );
}

export function AttentionZone({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
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

  function handleWriteResolution(item: AttentionItem) {
    if (!item.ticket) return;
    setResolutionPrompt({ ticketId: item.ticket.id, code: item.ticket.code, subject: item.ticket.subject });
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-black/5">
        <h2 className="font-display text-lg font-semibold text-fluent-neutral-95">Χρειάζονται εσένα</h2>
        <p className="text-xs text-fluent-neutral-60 mt-0.5">{items.length} στοιχεία περιμένουν</p>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-fluent-neutral-60">
          Όλα καθαρά 🎉 — τίποτα δεν περιμένει εσένα.
        </div>
      ) : (
        <ul className="divide-y divide-black/5">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const isBusy = pending && busyId === item.id;
            return (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 px-5 py-3">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70">
                  <Icon />
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={item.href} className="block truncate text-sm font-medium text-fluent-neutral-90 hover:text-fluent-blue-600">
                    {item.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2">
                    {item.subtitle && (
                      <span className="truncate text-xs text-fluent-neutral-60">{item.subtitle}</span>
                    )}
                    <AgeChip ageHours={item.ageHours} />
                  </div>
                </div>
                <div className="shrink-0">
                  {item.action === 'approve' ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleApprove(item)}
                      className={cn(
                        'rounded-md bg-fluent-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fluent-blue-700 disabled:opacity-50',
                      )}
                    >
                      {isBusy ? 'Έγκριση…' : ACTION_LABEL.approve}
                    </button>
                  ) : item.action === 'write_resolution' ? (
                    <button
                      type="button"
                      onClick={() => handleWriteResolution(item)}
                      className="rounded-md border border-fluent-neutral-20 px-3 py-1.5 text-xs font-medium text-fluent-neutral-80 hover:bg-fluent-neutral-6"
                    >
                      {ACTION_LABEL.write_resolution}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className="rounded-md border border-fluent-neutral-20 px-3 py-1.5 text-xs font-medium text-fluent-neutral-80 hover:bg-fluent-neutral-6"
                    >
                      {ACTION_LABEL.open}
                    </Link>
                  )}
                </div>
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
