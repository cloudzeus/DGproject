'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { replyToPortalTicket } from '../../actions';

export function PortalTicketReply({
  ticketId,
  needsInfo,
}: {
  ticketId: string;
  needsInfo: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 rounded-xl border border-fluent-neutral-20 bg-white p-4">
      {needsInfo && (
        <p className="mb-3 rounded-lg bg-[#fff4ce] p-3 text-sm text-fluent-neutral-80">
          Η ομάδα περιμένει την απάντησή σας για να συνεχίσει.
        </p>
      )}
      {sent && <p className="mb-2 text-sm text-green-700">Η απάντησή σας καταγράφηκε.</p>}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSent(false);
        }}
        rows={3}
        maxLength={3000}
        placeholder="Η απάντησή σας…"
        className="w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
      />
      <Button
        className="mt-2"
        variant="primary"
        icon={<Send20Regular />}
        disabled={pending || !body.trim()}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await replyToPortalTicket(ticketId, body);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setBody('');
            setSent(true);
            router.refresh();
          })
        }
      >
        Αποστολή
      </Button>
    </div>
  );
}
