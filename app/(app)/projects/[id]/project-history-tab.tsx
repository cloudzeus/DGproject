'use client';

import { useMemo, useState } from 'react';
import {
  Mail20Regular,
  TaskListSquareLtr20Regular,
  ChatBubblesQuestion20Regular,
  CalendarLtr20Regular,
  PersonAdd20Regular,
  Money20Regular,
  ChevronRight16Regular,
  ChevronDown16Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';

type Actor = { id?: string; name: string; email?: string; avatarUrl?: string };

export type HistoryEntry =
  | {
      kind: 'task';
      id: string;
      at: Date;
      actor: Actor;
      action: string; // created | updated | completed | moved | assigned | commented
      taskTitle: string;
      taskId: string;
      detail: string | null;
    }
  | {
      kind: 'email';
      id: string;
      at: Date;
      actor: Actor;
      direction: 'inbound' | 'outbound';
      subject: string;
      from: string;
      to: string;
      preview: string | null;
      llmAction: string | null;
      taskTitle?: string | null;
    }
  | {
      kind: 'question';
      id: string;
      at: Date;
      actor: Actor;
      taskTitle: string;
      question: string;
      askedToName: string;
      answer: string | null;
      answeredAt: Date | null;
    }
  | {
      kind: 'meeting';
      id: string;
      at: Date;
      actor: Actor;
      subject: string;
      summary: string | null;
      durationSec: number | null;
    }
  | {
      kind: 'member';
      id: string;
      at: Date;
      actor: Actor;
      memberName: string;
      memberRole: string;
    }
  | {
      kind: 'cost';
      id: string;
      at: Date;
      actor: Actor;
      itemName: string;
      quantity: number;
      amount: number;
    };

type Props = { entries: HistoryEntry[] };

const KIND_LABEL: Record<HistoryEntry['kind'], string> = {
  task: 'Εργασία',
  email: 'Email',
  question: 'Ερώτηση',
  meeting: 'Συνάντηση',
  member: 'Μέλος',
  cost: 'Κοστολόγηση',
};

const KIND_ICON: Record<HistoryEntry['kind'], typeof Mail20Regular> = {
  task: TaskListSquareLtr20Regular,
  email: Mail20Regular,
  question: ChatBubblesQuestion20Regular,
  meeting: CalendarLtr20Regular,
  member: PersonAdd20Regular,
  cost: Money20Regular,
};

const KIND_COLOR: Record<HistoryEntry['kind'], string> = {
  task: 'bg-fluent-blue-50 text-fluent-blue-700',
  email: 'bg-fluent-accent-green/10 text-fluent-accent-green',
  question: 'bg-fluent-accent-orange/10 text-fluent-accent-orange',
  meeting: 'bg-purple-50 text-purple-700',
  member: 'bg-fluent-neutral-8 text-fluent-neutral-90',
  cost: 'bg-amber-50 text-amber-700',
};

export function ProjectHistoryTab({ entries }: Props) {
  const [filter, setFilter] = useState<HistoryEntry['kind'] | 'all'>('all');

  // Group by calendar day for the expandable tree.
  const groups = useMemo(() => {
    const filtered = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
    const map = new Map<string, HistoryEntry[]>();
    for (const e of filtered) {
      const key = new Date(e.at).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, items]) => ({
        day,
        items: items.sort((a, b) => b.at.getTime() - a.at.getTime()),
      }));
  }, [entries, filter]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-1.5 flex-wrap">
        {(['all', 'task', 'email', 'question', 'meeting', 'member', 'cost'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`px-2.5 h-7 rounded-full text-xs ${
              filter === k ? 'bg-fluent-blue-600 text-white' : 'bg-fluent-neutral-8 text-fluent-neutral-80 hover:bg-fluent-neutral-10'
            }`}
          >
            {k === 'all' ? 'Όλα' : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="text-sm text-fluent-neutral-60">Δεν υπάρχουν εγγραφές.</div>
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <DayGroup key={g.day} day={g.day} items={g.items} />
        ))}
      </div>
    </div>
  );
}

function DayGroup({ day, items }: { day: string; items: HistoryEntry[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 hover:text-fluent-neutral-90"
      >
        {open ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
        <span>
          {new Date(day).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        <span className="text-fluent-neutral-50">({items.length})</span>
      </button>
      {open && (
        <div className="mt-2 ml-2 border-l border-black/10 pl-4 space-y-2">
          {items.map((e) => (
            <EntryRow key={`${e.kind}-${e.id}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = KIND_ICON[entry.kind];
  const color = KIND_COLOR[entry.kind];
  const time = entry.at.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  const canExpand = entryHasDetail(entry);

  return (
    <div className="bg-white border border-black/5 rounded-md">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={`w-full text-left p-2.5 flex items-start gap-2.5 ${canExpand ? 'hover:bg-black/5' : 'cursor-default'} rounded-md`}
      >
        <span className={`inline-flex items-center justify-center h-7 w-7 rounded-md shrink-0 ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-fluent-neutral-90">
            <EntryHeadline entry={entry} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-fluent-neutral-60 mt-0.5">
            <Avatar user={{ name: entry.actor.name, avatarUrl: entry.actor.avatarUrl }} size="xs" />
            <span>{entry.actor.name}</span>
            <span className="text-fluent-neutral-50">·</span>
            <span>{time}</span>
          </div>
        </div>
        {canExpand && (
          <span className="shrink-0 text-fluent-neutral-50 mt-0.5">
            {expanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
          </span>
        )}
      </button>
      {expanded && canExpand && (
        <div className="border-t border-black/5 px-3 py-2.5 text-sm text-fluent-neutral-80 whitespace-pre-wrap">
          <EntryDetail entry={entry} />
        </div>
      )}
    </div>
  );
}

function entryHasDetail(e: HistoryEntry): boolean {
  if (e.kind === 'task') return !!e.detail;
  if (e.kind === 'email') return !!e.preview;
  if (e.kind === 'question') return !!(e.question || e.answer);
  if (e.kind === 'meeting') return !!e.summary;
  return false;
}

function EntryHeadline({ entry }: { entry: HistoryEntry }) {
  switch (entry.kind) {
    case 'task':
      return (
        <>
          <span className="text-fluent-neutral-60">{taskActionLabel(entry.action)}:</span>{' '}
          <span className="font-medium">{entry.taskTitle}</span>
        </>
      );
    case 'email':
      return (
        <>
          <span className="text-fluent-neutral-60">
            {entry.direction === 'inbound' ? 'Εισερχόμενο' : 'Εξερχόμενο'} προς:
          </span>{' '}
          <span className="font-medium">{entry.subject}</span>
          {entry.taskTitle && (
            <span className="text-xs text-fluent-blue-700 ml-2">→ {entry.taskTitle}</span>
          )}
        </>
      );
    case 'question':
      return (
        <>
          <span className="text-fluent-neutral-60">Ερώτηση προς {entry.askedToName} σε:</span>{' '}
          <span className="font-medium">{entry.taskTitle}</span>
          {entry.answer && <span className="text-xs text-fluent-accent-green ml-2">Απαντήθηκε</span>}
        </>
      );
    case 'meeting':
      return <span className="font-medium">{entry.subject}</span>;
    case 'member':
      return (
        <>
          <span className="text-fluent-neutral-60">Προστέθηκε μέλος:</span>{' '}
          <span className="font-medium">{entry.memberName}</span>{' '}
          <span className="text-xs text-fluent-neutral-60">({entry.memberRole})</span>
        </>
      );
    case 'cost':
      return (
        <>
          <span className="text-fluent-neutral-60">Κοστολόγηση:</span>{' '}
          <span className="font-medium">{entry.itemName}</span>{' '}
          <span className="text-xs text-fluent-neutral-60">
            × {entry.quantity} = {entry.amount.toFixed(2)} €
          </span>
        </>
      );
  }
}

function EntryDetail({ entry }: { entry: HistoryEntry }) {
  if (entry.kind === 'task') return <>{entry.detail}</>;
  if (entry.kind === 'email') return <>{entry.preview}</>;
  if (entry.kind === 'question') {
    return (
      <>
        <div>
          <strong>Ερ:</strong> {entry.question}
        </div>
        {entry.answer && (
          <div className="mt-2">
            <strong>Απ:</strong> {entry.answer}
          </div>
        )}
      </>
    );
  }
  if (entry.kind === 'meeting') return <>{entry.summary}</>;
  return null;
}

function taskActionLabel(action: string): string {
  switch (action) {
    case 'created':
      return 'Δημιουργία';
    case 'updated':
      return 'Ενημέρωση';
    case 'completed':
      return 'Ολοκλήρωση';
    case 'commented':
      return 'Σχόλιο';
    case 'assigned':
      return 'Ανάθεση';
    case 'moved':
      return 'Αλλαγή status';
    default:
      return action;
  }
}
