'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Search20Regular,
  Grid20Regular,
  List20Regular,
  DocumentPdf24Regular,
  Image24Regular,
  Document24Regular,
  MoreHorizontal16Regular,
  Open16Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { cn, formatRelative } from '@/lib/utils';

export type FileRow = {
  id: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
  createdAt: string;
  uploadedBy: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  project: { id: string; name: string; color: string } | null;
  task: { id: string; title: string } | null;
};

interface Props {
  files: FileRow[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fileColor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '#8764B8';
  if (mimeType === 'application/pdf') return '#D83B01';
  if (mimeType.includes('word') || mimeType.includes('document')) return '#185ABD';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '#107C41';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '#C43E1C';
  return '#5C5C5C';
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image24Regular;
  if (mimeType === 'application/pdf') return DocumentPdf24Regular;
  return Document24Regular;
}

function fileAppLabel(mimeType: string, name: string): string {
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word')) return 'DOC';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'XLS';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PPT';
  const ext = name.split('.').pop()?.toUpperCase();
  return ext?.slice(0, 4) ?? 'FILE';
}

export function FilesClient({ files }: Props) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('list');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.title?.toLowerCase().includes(q) ?? false) ||
        f.project?.name.toLowerCase().includes(q) ||
        f.task?.title.toLowerCase().includes(q),
    );
  }, [files, query]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">
            Αρχεία
          </h1>
          <p className="text-fluent-neutral-60 mt-1">
            Όλα τα συνημμένα από projects και tasks ({files.length})
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-lg">
          <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση αρχείων, project ή task..."
            className="w-full h-10 pl-10 pr-4 rounded-md bg-white border border-fluent-neutral-20 text-sm placeholder:text-fluent-neutral-50 focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-1 p-1 bg-white rounded-lg border border-black/5 shadow-fluent-2">
          <button
            onClick={() => setView('grid')}
            className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center',
              view === 'grid' ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-60',
            )}
            aria-label="Grid view"
          >
            <Grid20Regular />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center',
              view === 'list' ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-60',
            )}
            aria-label="List view"
          >
            <List20Regular />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-12 text-center text-sm text-fluent-neutral-60">
          {files.length === 0
            ? 'Δεν έχει ανέβει ακόμη κανένα αρχείο. Τα συνημμένα στα tasks θα εμφανίζονται εδώ.'
            : 'Δεν βρέθηκαν αρχεία με αυτά τα κριτήρια.'}
        </div>
      ) : view === 'list' ? (
        <ListView rows={filtered} />
      ) : (
        <GridView rows={filtered} />
      )}
    </div>
  );
}

function AttachedTo({ row }: { row: FileRow }) {
  if (row.task && row.project) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ background: row.project.color }}
        />
        <div className="min-w-0">
          <Link
            href={`/projects/${row.project.id}`}
            className="text-[11px] text-fluent-neutral-60 hover:text-fluent-blue-700 uppercase tracking-wider font-medium block truncate"
          >
            {row.project.name}
          </Link>
          <span className="text-sm text-fluent-neutral-90 truncate block">{row.task.title}</span>
        </div>
      </div>
    );
  }
  if (row.project) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ background: row.project.color }}
        />
        <Link
          href={`/projects/${row.project.id}`}
          className="text-sm text-fluent-neutral-90 hover:text-fluent-blue-700 truncate"
        >
          {row.project.name}
        </Link>
      </div>
    );
  }
  return <span className="text-sm text-fluent-neutral-50">—</span>;
}

function ListView({ rows }: { rows: FileRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="grid grid-cols-[1fr_minmax(220px,1.2fr)_150px_150px_100px_50px] gap-4 px-5 h-10 items-center text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-50 border-b border-black/5 bg-fluent-neutral-4">
        <span>Όνομα</span>
        <span>Project / Task</span>
        <span>Ανέβηκε</span>
        <span>Από</span>
        <span>Μέγεθος</span>
        <span />
      </div>
      {rows.map((f, i) => {
        const color = fileColor(f.mimeType);
        const app = fileAppLabel(f.mimeType, f.name);
        return (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
            className="grid grid-cols-[1fr_minmax(220px,1.2fr)_150px_150px_100px_50px] gap-4 px-5 h-14 items-center border-b border-black/5 last:border-0 hover:bg-fluent-neutral-4 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-9 w-9 rounded-md flex items-center justify-center text-white font-bold text-[11px] shadow-fluent-2 shrink-0"
                style={{ background: color }}
              >
                {app}
              </div>
              <div className="min-w-0">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-medium text-sm text-fluent-neutral-90 hover:text-fluent-blue-700 truncate"
                  title={f.title ?? f.name}
                >
                  {f.title || f.name}
                </a>
                {f.title && (
                  <span className="block text-[11px] text-fluent-neutral-60 truncate">
                    {f.name}
                  </span>
                )}
              </div>
            </div>
            <AttachedTo row={f} />
            <span className="text-sm text-fluent-neutral-70">
              {formatRelative(new Date(f.createdAt))}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <Avatar user={f.uploadedBy} size="xs" />
              <span className="text-sm text-fluent-neutral-70 truncate">
                {f.uploadedBy.name}
              </span>
            </div>
            <span className="text-sm text-fluent-neutral-70 tabular-nums">
              {formatBytes(f.size)}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-7 w-7 rounded hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
                aria-label="Άνοιγμα"
              >
                <Open16Regular />
              </a>
              <button
                className="h-7 w-7 rounded hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
                aria-label="Περισσότερα"
              >
                <MoreHorizontal16Regular />
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function GridView({ rows }: { rows: FileRow[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {rows.map((f, i) => {
        const color = fileColor(f.mimeType);
        const Icon = fileIcon(f.mimeType);
        return (
          <motion.a
            key={f.id}
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.02 }}
            className="bg-white rounded-xl border border-black/5 shadow-fluent-2 hover:shadow-fluent-8 transition-all overflow-hidden block"
          >
            <div
              className="h-24 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)` }}
            >
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white shadow-fluent-4"
                style={{ background: color }}
              >
                <Icon className="h-6 w-6" />
              </div>
            </div>
            <div className="p-3">
              <p
                className="text-sm font-medium text-fluent-neutral-90 truncate mb-0.5"
                title={f.title ?? f.name}
              >
                {f.title || f.name}
              </p>
              {f.title && (
                <p className="text-[11px] text-fluent-neutral-60 truncate mb-1">{f.name}</p>
              )}
              {(f.project || f.task) && (
                <div className="flex items-center gap-1.5 mb-1">
                  {f.project && (
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: f.project.color }}
                    />
                  )}
                  <span className="text-[11px] text-fluent-neutral-60 truncate">
                    {f.task?.title ?? f.project?.name}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] text-fluent-neutral-60">
                <span>{formatBytes(f.size)}</span>
                <span>{formatRelative(new Date(f.createdAt))}</span>
              </div>
            </div>
          </motion.a>
        );
      })}
    </div>
  );
}
