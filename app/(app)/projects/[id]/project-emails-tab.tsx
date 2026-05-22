'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownload20Regular,
  Mail20Regular,
  ArrowUpRight20Regular,
  ArrowDownLeft20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmailImportModal } from './email-import-modal';

export type ProjectEmail = {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  subject: string;
  fromAddress: string;
  toAddresses: string;
  bodyPreview: string | null;
  receivedAt: Date | null;
  sentAt: Date | null;
  conversationId: string | null;
  llmAction: string | null;
  taskId: string | null;
  taskTitle: string | null;
};

type Props = {
  projectId: string;
  projectCode: string | null;
  emails: ProjectEmail[];
  openTasks: { id: string; title: string; status: string }[];
};

export function ProjectEmailsTab({ projectId, projectCode, emails, openTasks }: Props) {
  const [importOpen, setImportOpen] = useState(false);

  // Group by conversationId so threaded replies collapse into a single block.
  const threads = useMemo(() => {
    const map = new Map<string, ProjectEmail[]>();
    for (const e of emails) {
      const key = e.conversationId ?? `solo-${e.id}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.values())
      .map((arr) =>
        arr.sort((a, b) => {
          const da = (a.receivedAt ?? a.sentAt)?.getTime() ?? 0;
          const db = (b.receivedAt ?? b.sentAt)?.getTime() ?? 0;
          return da - db;
        }),
      )
      .sort((a, b) => {
        const da = (a[a.length - 1].receivedAt ?? a[a.length - 1].sentAt)?.getTime() ?? 0;
        const db = (b[b.length - 1].receivedAt ?? b[b.length - 1].sentAt)?.getTime() ?? 0;
        return db - da;
      });
  }, [emails]);

  if (!projectCode) {
    return (
      <div className="text-sm text-fluent-neutral-70 bg-fluent-neutral-4 px-4 py-3 rounded-md">
        Το έργο δεν έχει project code, οπότε το email routing δεν είναι ενεργό.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-fluent-neutral-70">
          {emails.length === 0
            ? 'Δεν έχουν εισαχθεί emails ακόμα.'
            : `${emails.length} μηνύματα σε ${threads.length} συζητήσεις`}
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <ArrowDownload20Regular className="h-4 w-4 mr-1.5" />
          Εισαγωγή από Outlook
        </Button>
      </div>

      <div className="space-y-3">
        {threads.map((thread, idx) => (
          <ThreadBlock key={idx} messages={thread} />
        ))}
      </div>

      <EmailImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        projectId={projectId}
        projectCode={projectCode}
        openTasks={openTasks}
      />
    </div>
  );
}

function ThreadBlock({ messages }: { messages: ProjectEmail[] }) {
  const [expanded, setExpanded] = useState(false);
  const last = messages[messages.length - 1];
  const headDate = (last.receivedAt ?? last.sentAt) as Date;

  return (
    <div className="border border-black/5 rounded-md bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-black/5 rounded-md"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Mail20Regular className="h-4 w-4 text-fluent-neutral-60 shrink-0" />
            <div className="font-medium text-sm text-fluent-neutral-95 truncate">{last.subject}</div>
            {messages.length > 1 && (
              <span className="text-[10px] text-fluent-neutral-60 bg-fluent-neutral-8 px-1.5 py-0.5 rounded">
                {messages.length}
              </span>
            )}
          </div>
          <div className="text-xs text-fluent-neutral-60 mt-1 truncate">
            {last.fromAddress} → {last.toAddresses}
          </div>
          <div className="text-xs text-fluent-neutral-70 mt-1 line-clamp-1">{last.bodyPreview}</div>
        </div>
        <div className="text-xs text-fluent-neutral-60 shrink-0">
          {headDate?.toLocaleString('el-GR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-black/5 divide-y divide-black/5">
          {messages.map((m) => (
            <div key={m.id} className="p-3">
              <div className="flex items-center gap-2 text-xs text-fluent-neutral-60 mb-2">
                {m.direction === 'inbound' ? (
                  <ArrowDownLeft20Regular className="h-3.5 w-3.5 text-fluent-accent-green" />
                ) : (
                  <ArrowUpRight20Regular className="h-3.5 w-3.5 text-fluent-blue-600" />
                )}
                <span>{m.fromAddress}</span>
                <span className="text-fluent-neutral-50">→</span>
                <span className="truncate">{m.toAddresses}</span>
                <span className="text-fluent-neutral-50">·</span>
                <span>{(m.receivedAt ?? m.sentAt)?.toLocaleString('el-GR')}</span>
                {m.llmAction && (
                  <Badge variant="blue">
                    {m.llmAction === 'create_task'
                      ? 'Νέο task'
                      : m.llmAction === 'update_task'
                      ? 'Ενημέρωση'
                      : 'Αρχείο'}
                  </Badge>
                )}
                {m.status === 'failed' && <Badge variant="red">Αποτυχία</Badge>}
              </div>
              {m.taskTitle && m.taskId && (
                <div className="text-xs text-fluent-blue-700 mb-1.5">→ Task: {m.taskTitle}</div>
              )}
              <div className="text-sm text-fluent-neutral-90 whitespace-pre-wrap">{m.bodyPreview}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
