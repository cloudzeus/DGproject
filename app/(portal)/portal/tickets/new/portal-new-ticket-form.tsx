'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createPortalTicket } from '../../actions';

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|pdf)$/i;

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalNewTicketForm({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('medium');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subjectOk = subject.trim().length >= 3;
  const bodyOk = body.trim().length >= 10;

  const validateFiles = (selected: File[]) => {
    if (selected.length > MAX_FILES) return 'Μπορείτε να επισυνάψετε έως 3 αρχεία.';
    if (selected.some((file) => file.size > MAX_FILE_BYTES)) {
      return 'Κάθε αρχείο πρέπει να είναι έως 5 MB.';
    }
    if (selected.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      return 'Τα συνημμένα πρέπει να είναι έως 15 MB συνολικά.';
    }
    if (selected.some((file) => !ACCEPTED_EXTENSIONS.test(file.name))) {
      return 'Επιτρέπονται αρχεία JPG, PNG, WebP και PDF.';
    }
    return null;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fileError = validateFiles(files);
    if (fileError) {
      setError(fileError);
      return;
    }

    const input = new FormData();
    input.set('subject', subject);
    input.set('body', body);
    input.set('priority', priority);
    files.forEach((file) => input.append('files', file));

    startTransition(async () => {
      setError(null);
      try {
        const res = await createPortalTicket(input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Το modal πρέπει να κλείσει πριν το navigation, αλλιώς μένει πάνω από
        // τη σελίδα του νέου αιτήματος και δίνει την εντύπωση παγωμένης οθόνης.
        onCancel?.();
        router.push(`/portal/tickets/${res.id}`);
      } catch {
        setError('Η υποβολή δεν ολοκληρώθηκε. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.');
      }
    });
  };

  return (
    <form className="space-y-4 pt-4" onSubmit={submit}>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="portal-ticket-subject" className="mb-1 block text-xs font-medium text-fluent-neutral-70">
          Θέμα
        </label>
        <input
          id="portal-ticket-subject"
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          disabled={pending}
          maxLength={200}
          required
          minLength={3}
          placeholder="Σύντομη περιγραφή του θέματος"
          className="h-10 w-full rounded-md border border-fluent-neutral-20 px-3 text-sm focus:border-fluent-blue-500 focus:outline-none focus:ring-2 focus:ring-fluent-blue-100 disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="portal-ticket-priority" className="mb-1 block text-xs font-medium text-fluent-neutral-70">
          Σημαντικότητα
        </label>
        <select
          id="portal-ticket-priority"
          name="priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          disabled={pending}
          className="h-10 w-full cursor-pointer rounded-md border border-fluent-neutral-20 bg-white px-3 text-sm focus:border-fluent-blue-500 focus:outline-none focus:ring-2 focus:ring-fluent-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="low">Χαμηλή</option>
          <option value="medium">Μεσαία</option>
          <option value="high">Υψηλή</option>
          <option value="urgent">Επείγουσα</option>
        </select>
      </div>

      <div>
        <label htmlFor="portal-ticket-body" className="mb-1 block text-xs font-medium text-fluent-neutral-70">
          Περιγραφή
        </label>
        <textarea
          id="portal-ticket-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={pending}
          rows={6}
          maxLength={5000}
          required
          minLength={10}
          placeholder="Τι συμβαίνει, πότε ξεκίνησε, τι έχετε δοκιμάσει…"
          className="w-full rounded-md border border-fluent-neutral-20 px-3 py-2 text-sm focus:border-fluent-blue-500 focus:outline-none focus:ring-2 focus:ring-fluent-blue-100 disabled:opacity-60"
        />
        <p className="mt-1 text-[10px] text-fluent-neutral-60">{body.trim().length}/5000 χαρακτήρες</p>
      </div>

      <div>
        <label htmlFor="portal-ticket-files" className="mb-1 block text-xs font-medium text-fluent-neutral-70">
          Συνημμένα <span className="font-normal text-fluent-neutral-50">(προαιρετικά)</span>
        </label>
        <input
          id="portal-ticket-files"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          disabled={pending}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            setFiles(selected);
            setError(validateFiles(selected));
          }}
          className="block min-h-11 w-full cursor-pointer rounded-md border border-dashed border-fluent-neutral-30 px-3 py-2 text-sm text-fluent-neutral-70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-fluent-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-fluent-blue-700 hover:border-fluent-blue-500 focus:outline-none focus:ring-2 focus:ring-fluent-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="mt-1 text-[11px] text-fluent-neutral-60">
          JPG, PNG, WebP ή PDF · έως 3 αρχεία · 5 MB ανά αρχείο
        </p>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1" aria-label="Επιλεγμένα αρχεία">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.lastModified}-${index}`}
                className="flex items-center justify-between gap-3 rounded-md bg-fluent-neutral-5 px-3 py-2 text-xs text-fluent-neutral-80"
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="shrink-0 text-fluent-neutral-60">{fileSize(file.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" disabled={pending || !subjectOk || !bodyOk}>
          {pending ? 'Υποβολή…' : 'Υποβολή'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            Άκυρο
          </Button>
        )}
      </div>
    </form>
  );
}
