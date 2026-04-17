'use client';

import { useRef, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  Dismiss20Regular, Attach20Regular, Delete20Regular,
  DocumentPdf20Regular, Image20Regular, Document20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { uploadTaskAttachment, deleteTaskAttachment } from './task-actions';
import { useRouter } from 'next/navigation';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Προς εκτέλεση' },
  { value: 'in_progress', label: 'Σε εξέλιξη' },
  { value: 'review', label: 'Προς έλεγχο' },
  { value: 'done', label: 'Ολοκληρωμένο' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Χαμηλή' },
  { value: 'medium', label: 'Μεσαία' },
  { value: 'high', label: 'Υψηλή' },
  { value: 'urgent', label: 'Επείγουσα' },
];

export type TaskAssigneeOption = { id: string; name: string; email: string };

export type TaskAttachmentInfo = {
  id: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
};

export type TaskFormInitial = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: Date | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  assigneeIds: string[];
};

function toDateTimeInput(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  members: TaskAssigneeOption[];
  initial?: TaskFormInitial;
  submitLabel: string;
  onSubmit: (fd: FormData) => Promise<{ ok: boolean; error?: string } | void>;
  onCancel: () => void;
  projectId?: string;
  taskId?: string;
  attachments?: TaskAttachmentInfo[];
};

export function TaskForm({ members, initial, submitLabel, onSubmit, onCancel, projectId, taskId, attachments }: Props) {
  const [assignees, setAssignees] = useState<string[]>(initial?.assigneeIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleAssignee(id: string) {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(formData);
      if (res && !res.ok && res.error) setError(res.error);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Τίτλος</label>
        <input
          name="title"
          defaultValue={initial?.title ?? ''}
          required
          minLength={2}
          autoFocus
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Περιγραφή</label>
        <textarea
          name="description"
          defaultValue={initial?.description ?? ''}
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Κατάσταση</label>
          <select
            name="status"
            defaultValue={initial?.status ?? 'todo'}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Προτεραιότητα</label>
          <select
            name="priority"
            defaultValue={initial?.priority ?? 'medium'}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Έναρξη</label>
          <input
            type="datetime-local"
            name="startDate"
            min="2020-01-01T09:00"
            defaultValue={toDateTimeInput(initial?.startDate ?? null)}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Λήξη</label>
          <input
            type="datetime-local"
            name="dueDate"
            defaultValue={toDateTimeInput(initial?.dueDate ?? null)}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Εκτιμώμενες ώρες</label>
          <input
            type="number"
            name="estimatedHours"
            step="0.25"
            min="0"
            defaultValue={initial?.estimatedHours ?? ''}
            placeholder="π.χ. 4.5"
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <p className="text-[11px] text-fluent-neutral-60">
        Τα tasks περιορίζονται σε ώρες εργασίας 09:00–18:30. Ώρες εκτός ωραρίου μετατίθενται στο επόμενο 09:00.
      </p>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1.5">Ανάθεση σε</label>
        {members.length === 0 ? (
          <p className="text-xs text-fluent-neutral-60">Δεν υπάρχουν μέλη στο έργο.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-md border border-fluent-neutral-20">
            {members.map((u) => {
              const active = assignees.includes(u.id);
              return (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => toggleAssignee(u.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1 ${
                    active
                      ? 'bg-fluent-blue-600 text-white border-transparent'
                      : 'border-fluent-neutral-20 text-fluent-neutral-80 hover:bg-fluent-neutral-4'
                  }`}
                >
                  {active && <Dismiss20Regular className="h-3 w-3" />}
                  {u.name || u.email}
                </button>
              );
            })}
          </div>
        )}
        {assignees.map((id) => (
          <input key={id} type="hidden" name="assigneeIds" value={id} />
        ))}
      </div>

      {projectId && taskId && (
        <AttachmentsPanel projectId={projectId} taskId={taskId} attachments={attachments ?? []} />
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={pending}>Ακύρωση</Button>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? 'Αποθήκευση…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function AttachmentsPanel({
  projectId,
  taskId,
  attachments,
}: {
  projectId: string;
  taskId: string;
  attachments: TaskAttachmentInfo[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setUploadError(null);
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      if (title.trim()) fd.append('title', title.trim());
      const res = await uploadTaskAttachment(projectId, taskId, fd);
      if (res && !res.ok && res.error) {
        setUploadError(res.error);
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
    setUploadError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleRemove(id: string) {
    if (!confirm('Να διαγραφεί το συνημμένο;')) return;
    startTransition(async () => {
      await deleteTaskAttachment(projectId, id);
      router.refresh();
    });
  }

  return (
    <div className="pt-3 border-t border-black/5">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-fluent-neutral-70 inline-flex items-center gap-1.5">
          <Attach20Regular className="h-4 w-4" />
          Συνημμένα ({attachments.length})
        </label>
        {!pendingFile && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Επιλογή αρχείου
          </Button>
        )}
        <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {pendingFile && (
        <div className="bg-fluent-neutral-4 border border-fluent-neutral-20 rounded-md p-3 mb-2 space-y-2">
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
              placeholder="π.χ. Προσφορά πελάτη, Φωτογραφία χώρου…"
              className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleCancel} disabled={uploading}>
              Ακύρωση
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Μεταφόρτωση…' : 'Ανέβασμα'}
            </Button>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
          {uploadError}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-fluent-neutral-60">Δεν υπάρχουν συνημμένα.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-sm rounded-md border border-fluent-neutral-20 px-2 py-1.5"
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
                {a.title && (
                  <span className="block text-[11px] text-fluent-neutral-60 truncate">{a.name}</span>
                )}
              </div>
              <span className="text-[11px] text-fluent-neutral-60 tabular-nums shrink-0">
                {formatBytes(a.size)}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                className="h-7 w-7 rounded hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60"
                aria-label="Διαγραφή"
              >
                <Delete20Regular className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image20Regular className="h-5 w-5 text-fluent-blue-600 shrink-0" />;
  if (mimeType === 'application/pdf') return <DocumentPdf20Regular className="h-5 w-5 text-fluent-accent-red shrink-0" />;
  return <Document20Regular className="h-5 w-5 text-fluent-neutral-60 shrink-0" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function TaskModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-xl shadow-fluent-16 w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-black/5 sticky top-0 bg-white z-10">
          <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">{title}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}
