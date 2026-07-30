'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createPortalTicket } from '../../actions';

export function PortalNewTicketForm({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subjectOk = subject.trim().length >= 3;
  const bodyOk = body.trim().length >= 10;

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
      )}

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Θέμα</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder="Σύντομη περιγραφή του θέματος"
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Περιγραφή</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={5000}
          placeholder="Τι συμβαίνει, πότε ξεκίνησε, τι έχετε δοκιμάσει…"
          className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
        <p className="mt-1 text-[10px] text-fluent-neutral-60">
          {body.trim().length}/5000 χαρακτήρες
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={pending || !subjectOk || !bodyOk}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await createPortalTicket({ subject, body });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push(`/portal/tickets/${res.id}`);
            })
          }
        >
          {pending ? 'Υποβολή…' : 'Υποβολή'}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Άκυρο
          </Button>
        )}
      </div>
    </div>
  );
}
