'use client';

import { useMemo, useState } from 'react';
import {
  DocumentMultiple20Regular,
  DocumentPdf20Regular,
  Image20Regular,
  Document20Regular,
  Search20Regular,
  Folder20Regular,
  TaskListLtr20Regular,
  ChatBubblesQuestion20Regular,
} from '@fluentui/react-icons';

type ProjectFileKind = 'project' | 'task' | 'question';

type TaskContext = { taskId: string; taskTitle: string };
type QuestionContext = TaskContext & {
  questionPreview: string;
  answerPreview: string | null;
  askedByName: string;
  askedToName: string;
  answeredAt: Date | null;
};

export type ProjectFileItem =
  | {
      id: string;
      kind: 'project';
      name: string;
      title: string | null;
      size: number;
      mimeType: string;
      url: string;
      createdAt: Date;
      uploadedByName: string;
      context: null;
    }
  | {
      id: string;
      kind: 'task';
      name: string;
      title: string | null;
      size: number;
      mimeType: string;
      url: string;
      createdAt: Date;
      uploadedByName: string;
      context: TaskContext | null;
    }
  | {
      id: string;
      kind: 'question';
      questionKind: 'question' | 'answer';
      name: string;
      title: string | null;
      size: number;
      mimeType: string;
      url: string;
      createdAt: Date;
      uploadedByName: string;
      context: QuestionContext;
    };

const KIND_LABEL: Record<ProjectFileKind, string> = {
  project: 'Έργο',
  task: 'Εργασία',
  question: 'Ερώτηση',
};

const KIND_TONE: Record<ProjectFileKind, string> = {
  project: 'bg-fluent-blue-50 text-fluent-blue-700 border-fluent-blue-200',
  task: 'bg-fluent-accent-purple/10 text-fluent-accent-purple border-fluent-accent-purple/30',
  question: 'bg-fluent-accent-orange/10 text-fluent-accent-orange border-fluent-accent-orange/30',
};

const KIND_ICON: Record<ProjectFileKind, React.ComponentType<{ className?: string }>> = {
  project: Folder20Regular,
  task: TaskListLtr20Regular,
  question: ChatBubblesQuestion20Regular,
};

export function ProjectFiles({ files }: { files: ProjectFileItem[] }) {
  const [filter, setFilter] = useState<'all' | ProjectFileKind>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Record<'all' | ProjectFileKind, number> = {
      all: files.length,
      project: 0,
      task: 0,
      question: 0,
    };
    for (const f of files) c[f.kind] += 1;
    return c;
  }, [files]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (filter !== 'all' && f.kind !== filter) return false;
      if (!q) return true;
      const haystack = [
        f.name,
        f.title ?? '',
        f.uploadedByName,
        f.kind === 'task' ? f.context?.taskTitle ?? '' : '',
        f.kind === 'question' ? f.context.taskTitle : '',
        f.kind === 'question' ? f.context.questionPreview : '',
        f.kind === 'question' ? f.context.answerPreview ?? '' : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [files, filter, query]);

  const filterButtons: Array<{ id: 'all' | ProjectFileKind; label: string; count: number }> = [
    { id: 'all', label: 'Όλα', count: counts.all },
    { id: 'project', label: 'Έργου', count: counts.project },
    { id: 'task', label: 'Εργασιών', count: counts.task },
    { id: 'question', label: 'Ερωτήσεων', count: counts.question },
  ];

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2">
      <div className="p-4 border-b border-black/5 flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-display font-semibold text-fluent-neutral-90 inline-flex items-center gap-2">
          <DocumentMultiple20Regular className="h-5 w-5 text-fluent-blue-600" />
          Όλα τα αρχεία
          <span className="text-xs font-medium text-fluent-neutral-60 px-1.5 py-0.5 rounded-full bg-fluent-neutral-8">
            {files.length}
          </span>
        </h3>
        <div className="relative w-full sm:w-72">
          <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fluent-neutral-50 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση αρχείων…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="inline-flex items-center bg-fluent-neutral-4 rounded-lg p-1">
          {filterButtons.map((b) => {
            const active = filter === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setFilter(b.id)}
                className={`text-xs h-7 px-3 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-white text-fluent-blue-700 shadow-fluent-2'
                    : 'text-fluent-neutral-70 hover:bg-white/60'
                }`}
              >
                {b.label}
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${
                    active ? 'bg-fluent-blue-600 text-white' : 'bg-fluent-neutral-8 text-fluent-neutral-70'
                  }`}
                >
                  {b.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-fluent-neutral-20 px-4 py-10 text-center">
            <DocumentMultiple20Regular className="h-8 w-8 mx-auto text-fluent-neutral-40 mb-2" />
            <p className="text-sm text-fluent-neutral-70 font-medium">
              {files.length === 0
                ? 'Δεν υπάρχουν αρχεία στο έργο'
                : 'Κανένα αρχείο δεν ταιριάζει στα φίλτρα'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {visible.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileRow({ file: f }: { file: ProjectFileItem }) {
  const KindIcon = KIND_ICON[f.kind];
  const kindBadgeLabel =
    f.kind === 'question'
      ? `${KIND_LABEL.question} · ${f.questionKind === 'question' ? 'ερώτηση' : 'απάντηση'}`
      : KIND_LABEL[f.kind];
  const tooltip = buildTooltip(f);

  return (
    <li className="group/file flex items-center gap-3 py-2.5">
      <FileIcon mimeType={f.mimeType} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-1.5">
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-fluent-blue-700 hover:underline truncate max-w-[420px]"
            title={tooltip}
          >
            {f.title || f.name}
          </a>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${KIND_TONE[f.kind]}`}
            title={tooltip}
          >
            <KindIcon className="h-3 w-3" />
            {kindBadgeLabel}
          </span>
        </div>
        <ContextLine file={f} />
      </div>
      <span className="text-[11px] text-fluent-neutral-60 tabular-nums shrink-0 hidden sm:inline">
        {formatBytes(f.size)}
      </span>
      <span
        className="text-[11px] text-fluent-neutral-50 shrink-0 hidden md:inline"
        title={f.createdAt.toLocaleString('el-GR')}
      >
        {formatRelative(f.createdAt)}
      </span>
    </li>
  );
}

function ContextLine({ file: f }: { file: ProjectFileItem }) {
  if (f.kind === 'project') {
    return (
      <p className="text-[11px] text-fluent-neutral-60 truncate">
        Ανέβασε ο/η {f.uploadedByName}
        {f.title ? ` · ${f.name}` : ''}
      </p>
    );
  }
  if (f.kind === 'task') {
    return (
      <p className="text-[11px] text-fluent-neutral-60 truncate">
        Σε εργασία:{' '}
        <span className="font-medium text-fluent-neutral-80">
          {f.context?.taskTitle ?? '—'}
        </span>{' '}
        · ανέβασε ο/η {f.uploadedByName}
        {f.title ? ` · ${f.name}` : ''}
      </p>
    );
  }
  // question
  const ctx = f.context;
  const verb = f.questionKind === 'question' ? 'σε ερώτηση' : 'σε απάντηση';
  return (
    <p className="text-[11px] text-fluent-neutral-60 truncate">
      {verb} στην εργασία:{' '}
      <span className="font-medium text-fluent-neutral-80">{ctx.taskTitle}</span> · ανέβασε ο/η{' '}
      {f.uploadedByName}
    </p>
  );
}

function buildTooltip(f: ProjectFileItem): string {
  const parts: string[] = [];
  if (f.title) parts.push(`${f.title} (${f.name})`);
  else parts.push(f.name);
  if (f.kind === 'project') {
    parts.push('Συνημμένο έργου');
  } else if (f.kind === 'task') {
    parts.push(`Εργασία: ${f.context?.taskTitle ?? '—'}`);
  } else {
    parts.push(`Εργασία: ${f.context.taskTitle}`);
    parts.push(
      f.questionKind === 'question'
        ? `Ερώτηση από ${f.context.askedByName} προς ${f.context.askedToName}`
        : `Απάντηση από ${f.context.askedToName} προς ${f.context.askedByName}`,
    );
    if (f.context.questionPreview) {
      parts.push(`Q: ${truncate(f.context.questionPreview, 200)}`);
    }
    if (f.questionKind === 'answer' && f.context.answerPreview) {
      parts.push(`A: ${truncate(f.context.answerPreview, 200)}`);
    }
  }
  parts.push(`Ανέβασε: ${f.uploadedByName}`);
  parts.push(`Ημερομηνία: ${f.createdAt.toLocaleString('el-GR')}`);
  parts.push(`Μέγεθος: ${formatBytes(f.size)}`);
  return parts.join('\n');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/'))
    return <Image20Regular className="h-5 w-5 text-fluent-blue-600 shrink-0" />;
  if (mimeType === 'application/pdf')
    return <DocumentPdf20Regular className="h-5 w-5 text-fluent-accent-red shrink-0" />;
  return <Document20Regular className="h-5 w-5 text-fluent-neutral-60 shrink-0" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatRelative(d: Date): string {
  const now = Date.now();
  const t = d.getTime();
  const diff = now - t;
  const min = Math.round(diff / 60_000);
  if (min < 60) return min <= 1 ? 'μόλις τώρα' : `${min} λεπτά πριν`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ώρες πριν`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} ημέρες πριν`;
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
}
