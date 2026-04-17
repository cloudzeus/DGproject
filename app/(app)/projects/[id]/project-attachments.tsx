'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Attach20Regular,
  Delete20Regular,
  DocumentPdf20Regular,
  Image20Regular,
  Document20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { uploadProjectAttachment, deleteProjectAttachment } from './task-actions';

export type ProjectAttachmentInfo = {
  id: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
  uploadedByName: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/'))
    return <Image20Regular className="h-5 w-5 text-fluent-blue-600 shrink-0" />;
  if (mimeType === 'application/pdf')
    return <DocumentPdf20Regular className="h-5 w-5 text-fluent-accent-red shrink-0" />;
  return <Document20Regular className="h-5 w-5 text-fluent-neutral-60 shrink-0" />;
}

interface Props {
  projectId: string;
  attachments: ProjectAttachmentInfo[];
  canEdit: boolean;
}

export function ProjectAttachments({ projectId, attachments, canEdit }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setError(null);
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      if (title.trim()) fd.append('title', title.trim());
      const res = await uploadProjectAttachment(projectId, fd);
      if (res && !res.ok && res.error) {
        setError(res.error);
      } else {
        setPendingFile(null);
        setTitle('');
        if (inputRef.current) inputRef.current.value = '';
        startTransition(() => router.refresh());
      }
    } finally {
      setUploading(false);
    }
  }

  function handleCancel() {
    setPendingFile(null);
    setTitle('');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleRemove(id: string) {
    if (!confirm('Να διαγραφεί το συνημμένο;')) return;
    startTransition(async () => {
      await deleteProjectAttachment(projectId, id);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2">
      <div className="flex items-center justify-between p-4 border-b border-black/5">
        <h3 className="font-display font-semibold text-fluent-neutral-90 inline-flex items-center gap-2">
          <Attach20Regular className="h-5 w-5" /> Συνημμένα έργου ({attachments.length})
        </h3>
        {canEdit && !pendingFile && (
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            Επιλογή αρχείου
          </Button>
        )}
        <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="p-4 space-y-3">
        {canEdit && pendingFile && (
          <div className="bg-fluent-neutral-4 border border-fluent-neutral-20 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <FileIcon mimeType={pendingFile.type} />
              <span className="flex-1 min-w-0 truncate font-medium text-fluent-neutral-90">
                {pendingFile.name}
              </span>
              <span className="text-[11px] text-fluent-neutral-60 tabular-nums">
                {formatBytes(pendingFile.size)}
              </span>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-fluent-neutral-70 mb-1">
                Περιγραφή αρχείου (προαιρ.)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="π.χ. Σύμβαση έργου, Προδιαγραφές, Proposal v2…"
                className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCancel}
                disabled={uploading}
              >
                Ακύρωση
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Μεταφόρτωση…' : 'Ανέβασμα'}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </div>
        )}

        {attachments.length === 0 && !pendingFile ? (
          <p className="text-sm text-fluent-neutral-60 py-2">
            Δεν υπάρχουν συνημμένα στο έργο.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 text-sm rounded-md border border-fluent-neutral-20 px-3 py-2"
              >
                <FileIcon mimeType={a.mimeType} />
                <div className="flex-1 min-w-0">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-fluent-blue-700 hover:underline font-medium"
                    title={a.title ?? a.name}
                  >
                    {a.title || a.name}
                  </a>
                  <span className="block text-[11px] text-fluent-neutral-60 truncate">
                    {a.title ? `${a.name} · ` : ''}
                    Ανέβασε ο/η {a.uploadedByName}
                  </span>
                </div>
                <span className="text-[11px] text-fluent-neutral-60 tabular-nums shrink-0">
                  {formatBytes(a.size)}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    className="h-7 w-7 rounded hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60"
                    aria-label="Διαγραφή"
                  >
                    <Delete20Regular className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
