'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Dismiss20Regular,
  Send20Regular,
  TextBold20Regular,
  TextItalic20Regular,
  TextUnderline20Regular,
  Link20Regular,
  TextBulletList20Regular,
  Attach20Regular,
  Document20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';

export type EmailRecipientOption = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  // Reusable across project / task / question contexts. The server action
  // decides what to do with the email + which routing tag to embed based on
  // (projectId, taskId, questionId).
  context: {
    projectId: string;
    projectCode: string;
    taskId?: string | null;
    questionId?: string | null;
  };
  // Recipients to choose from (project members + customer contact).
  recipients: EmailRecipientOption[];
  // Optional defaults that the caller pre-fills (e.g. customer email, task
  // title as subject).
  defaultTo?: string[];
  defaultSubject?: string;
  defaultBody?: string;
  // Server action: returns { ok, error? }
  onSend: (input: {
    projectId: string;
    taskId?: string | null;
    questionId?: string | null;
    to: string[];
    cc: string[];
    subject: string;
    bodyHtml: string;
    attachments?: { name: string; contentType: string; dataBase64: string }[];
  }) => Promise<{ ok: boolean; error?: string }>;
};

// Ίδια όρια με το server action (email-actions.ts) — εδώ για άμεσο feedback.
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function EmailComposerModal({
  open,
  onClose,
  context,
  recipients,
  defaultTo = [],
  defaultSubject = '',
  defaultBody = '',
  onSend,
}: Props) {
  const [to, setTo] = useState<string[]>(defaultTo);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState(defaultSubject);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setCc([]);
      setSubject(defaultSubject);
      setFiles([]);
      setError(null);
      // Reset editor content when re-opened.
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = defaultBody;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function toggleRecipient(list: string[], setList: (v: string[]) => void, email: string) {
    setList(list.includes(email) ? list.filter((e) => e !== email) : [...list, email]);
  }

  function exec(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function handleInsertLink() {
    const url = window.prompt('URL συνδέσμου:', 'https://');
    if (url) exec('createLink', url);
  }

  function handlePickFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`Το «${f.name}» ξεπερνά τα 3MB ανά αρχείο.`);
        continue;
      }
      if (next.length >= MAX_ATTACHMENTS) {
        setError(`Έως ${MAX_ATTACHMENTS} συνημμένα ανά email.`);
        break;
      }
      if (next.reduce((a, x) => a + x.size, 0) + f.size > MAX_TOTAL_BYTES) {
        setError('Τα συνημμένα ξεπερνούν συνολικά τα 20MB.');
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    setError(null);
    if (to.length === 0) {
      setError('Επίλεξε τουλάχιστον έναν παραλήπτη.');
      return;
    }
    if (subject.trim().length === 0) {
      setError('Το θέμα δεν μπορεί να είναι κενό.');
      return;
    }
    const bodyHtml = editorRef.current?.innerHTML ?? '';
    if (bodyHtml.replace(/<[^>]+>/g, '').trim().length === 0) {
      setError('Το μήνυμα δεν μπορεί να είναι κενό.');
      return;
    }
    setSending(true);
    let attachments: { name: string; contentType: string; dataBase64: string }[] | undefined;
    try {
      attachments =
        files.length > 0
          ? await Promise.all(
              files.map(async (f) => ({
                name: f.name,
                contentType: f.type || 'application/octet-stream',
                dataBase64: await fileToBase64(f),
              })),
            )
          : undefined;
    } catch {
      setSending(false);
      setError('Αποτυχία ανάγνωσης συνημμένων.');
      return;
    }
    const result = await onSend({
      projectId: context.projectId,
      taskId: context.taskId ?? null,
      questionId: context.questionId ?? null,
      to,
      cc,
      subject: subject.trim(),
      bodyHtml,
      attachments,
    });
    setSending(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? 'Αποτυχία αποστολής.');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-xl shadow-fluent-16 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-black/5">
          <div className="font-display font-semibold text-fluent-neutral-95">Νέο email</div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-black/5 flex items-center justify-center text-fluent-neutral-70"
          >
            <Dismiss20Regular />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <RecipientPicker
            label="Προς"
            recipients={recipients}
            selected={to}
            onToggle={(email) => toggleRecipient(to, setTo, email)}
          />
          <RecipientPicker
            label="Κοιν."
            recipients={recipients.filter((r) => !to.includes(r.email))}
            selected={cc}
            onToggle={(email) => toggleRecipient(cc, setCc, email)}
          />

          <div>
            <label className="text-xs font-semibold text-fluent-neutral-70 block mb-1">Θέμα</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Θέμα του email"
              className="w-full px-3 h-9 rounded-md border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-fluent-blue-200"
            />
            <div className="text-[11px] text-fluent-neutral-60 mt-1">
              Το tag <code className="bg-black/5 px-1 rounded">[FPM:p={context.projectCode}]</code>{' '}
              θα προστεθεί αυτόματα ως κρυφό footer, ώστε οι απαντήσεις να επιστρέφουν στο έργο.
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-fluent-neutral-70 block mb-1">Μήνυμα</label>
            <div className="flex items-center gap-0.5 px-2 h-9 border border-black/10 border-b-0 rounded-t-md bg-fluent-neutral-4">
              <ToolbarBtn onClick={() => exec('bold')} title="Bold (Ctrl+B)">
                <TextBold20Regular />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec('italic')} title="Italic (Ctrl+I)">
                <TextItalic20Regular />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec('underline')} title="Underline (Ctrl+U)">
                <TextUnderline20Regular />
              </ToolbarBtn>
              <div className="w-px h-5 bg-black/10 mx-1" />
              <ToolbarBtn onClick={() => exec('insertUnorderedList')} title="Λίστα">
                <TextBulletList20Regular />
              </ToolbarBtn>
              <ToolbarBtn onClick={handleInsertLink} title="Σύνδεσμος">
                <Link20Regular />
              </ToolbarBtn>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="min-h-[180px] max-h-[40vh] overflow-y-auto px-3 py-2 border border-black/10 rounded-b-md text-sm focus:outline-none focus:ring-2 focus:ring-fluent-blue-200 prose prose-sm max-w-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-fluent-neutral-70">
                Συνημμένα{files.length > 0 && ` (${files.length}/${MAX_ATTACHMENTS} · ${formatSize(files.reduce((a, f) => a + f.size, 0))})`}
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-medium text-fluent-blue-600 hover:underline"
              >
                <Attach20Regular className="h-3.5 w-3.5" />
                Προσθήκη αρχείων
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handlePickFiles(e.target.files)}
              />
            </div>
            {files.length === 0 ? (
              <p className="text-[11px] text-fluent-neutral-50">
                Έως {MAX_ATTACHMENTS} αρχεία, 3MB το καθένα (σύνολο 20MB).
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <li
                    key={`${f.name}-${f.size}`}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1 h-7 rounded-full bg-fluent-neutral-6 border border-black/5 text-xs text-fluent-neutral-80"
                    title={f.name}
                  >
                    <Document20Regular className="h-3.5 w-3.5 text-fluent-neutral-60 shrink-0" />
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <span className="text-fluent-neutral-50 tabular-nums">{formatSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((x) => x !== f))}
                      aria-label={`Αφαίρεση ${f.name}`}
                      className="h-5 w-5 rounded-full hover:bg-black/10 flex items-center justify-center text-fluent-neutral-60"
                    >
                      <Dismiss20Regular className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="text-sm text-fluent-accent-red bg-fluent-accent-red/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 h-14 border-t border-black/5 bg-fluent-neutral-4">
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Άκυρο
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            <Send20Regular className="h-4 w-4 mr-1.5" />
            {sending ? 'Αποστολή…' : 'Αποστολή'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function ToolbarBtn({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="h-7 w-7 rounded hover:bg-black/5 flex items-center justify-center text-fluent-neutral-80"
    >
      {children}
    </button>
  );
}

function RecipientPicker({
  label,
  recipients,
  selected,
  onToggle,
}: {
  label: string;
  recipients: EmailRecipientOption[];
  selected: string[];
  onToggle: (email: string) => void;
}) {
  const [extra, setExtra] = useState('');

  function handleAddExtra() {
    const value = extra.trim();
    // Minimal email shape check — server re-validates.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
    if (!selected.includes(value)) onToggle(value);
    setExtra('');
  }

  return (
    <div>
      <label className="text-xs font-semibold text-fluent-neutral-70 block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {recipients.map((r) => {
          const active = selected.includes(r.email);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onToggle(r.email)}
              className={`inline-flex items-center gap-1.5 px-2 h-7 rounded-full text-xs border transition-colors ${
                active
                  ? 'bg-fluent-blue-50 border-fluent-blue-300 text-fluent-blue-700'
                  : 'bg-white border-black/10 text-fluent-neutral-80 hover:bg-black/5'
              }`}
              title={r.email}
            >
              <span>{r.name}</span>
              <span className="text-fluent-neutral-50">·</span>
              <span className="text-fluent-neutral-60">{r.email}</span>
            </button>
          );
        })}
      </div>
      {/* Selected recipients that aren't in the project member list (typed
          manually or a customer that wasn't pre-loaded). */}
      {selected.filter((e) => !recipients.some((r) => r.email === e)).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {selected
            .filter((e) => !recipients.some((r) => r.email === e))
            .map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onToggle(e)}
                className="inline-flex items-center gap-1.5 px-2 h-7 rounded-full text-xs bg-fluent-blue-50 border border-fluent-blue-300 text-fluent-blue-700"
              >
                <span>{e}</span>
                <Dismiss20Regular className="h-3 w-3" />
              </button>
            ))}
        </div>
      )}
      <div className="mt-1.5 flex gap-1">
        <input
          type="email"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddExtra();
            }
          }}
          placeholder="Άλλη διεύθυνση…"
          className="flex-1 px-2 h-7 rounded-md border border-black/10 text-xs focus:outline-none focus:ring-2 focus:ring-fluent-blue-200"
        />
        <button
          type="button"
          onClick={handleAddExtra}
          className="px-2 h-7 rounded-md text-xs bg-fluent-neutral-8 hover:bg-fluent-neutral-10 text-fluent-neutral-90"
        >
          Προσθήκη
        </button>
      </div>
    </div>
  );
}
