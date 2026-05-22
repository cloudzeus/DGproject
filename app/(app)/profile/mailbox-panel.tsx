'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Props = {
  connected: boolean;
  scopes: string | null;
  connectedAt: Date | null;
};

// Toast strings keyed by the ?mail= query the OAuth callback sets.
const TOAST: Record<string, { kind: 'ok' | 'err'; msg: string }> = {
  connected: { kind: 'ok', msg: 'Το mailbox συνδέθηκε με επιτυχία.' },
  denied: { kind: 'err', msg: 'Δεν εγκρίθηκε η πρόσβαση στο mailbox.' },
  missing: { kind: 'err', msg: 'Λείπει το authorization code από τη Microsoft.' },
  state_mismatch: { kind: 'err', msg: 'Αποτυχία επαλήθευσης ασφαλείας — δοκίμασε ξανά.' },
  token_error: { kind: 'err', msg: 'Δεν ήταν δυνατή η ανταλλαγή token.' },
  forbidden: { kind: 'err', msg: 'Δεν επιτρέπεται η σύνδεση mailbox για αυτόν τον λογαριασμό.' },
};

export function MailboxPanel({ connected, scopes, connectedAt }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const key = params.get('mail');
    if (key && TOAST[key]) {
      setToast(TOAST[key]);
      // Clear the query so it doesn't re-fire on refresh.
      const url = new URL(window.location.href);
      url.searchParams.delete('mail');
      url.searchParams.delete('detail');
      window.history.replaceState({}, '', url.toString());
    }
  }, [params]);

  function handleConnect() {
    window.location.href = '/api/mail/connect/start';
  }

  function handleDisconnect() {
    startTransition(async () => {
      await fetch('/api/mail/disconnect', { method: 'POST' });
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6 mt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-fluent-neutral-95">
            Microsoft Mailbox
          </h2>
          <p className="text-sm text-fluent-neutral-70 mt-1 max-w-2xl">
            Σύνδεσε το Outlook mailbox σου για να εισάγεις emails σχετικά με ένα έργο και να
            δημιουργείς ή να ενημερώνεις tasks. Η εφαρμογή ψάχνει emails με την ετικέτα έργου
            (<code className="bg-black/5 px-1 rounded text-[11px]">[FPM:p=…]</code>) και τα
            αναλύει με AI πριν τα συσχετίσει.
          </p>
        </div>
        {connected ? (
          <Button variant="secondary" onClick={handleDisconnect} disabled={pending}>
            {pending ? 'Αποσύνδεση…' : 'Αποσύνδεση'}
          </Button>
        ) : (
          <Button onClick={handleConnect}>Σύνδεση mailbox</Button>
        )}
      </div>

      {connected && (
        <div className="mt-4 text-xs text-fluent-neutral-60 space-y-1">
          <div>
            Συνδέθηκε:{' '}
            <span className="text-fluent-neutral-90">
              {connectedAt ? new Date(connectedAt).toLocaleString('el-GR') : '—'}
            </span>
          </div>
          {scopes && (
            <div className="break-all">
              Άδειες:{' '}
              <span className="text-fluent-neutral-90">{scopes.replace(/https:\/\/graph\.microsoft\.com\//g, '')}</span>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div
          className={`mt-4 text-sm px-3 py-2 rounded-md ${
            toast.kind === 'ok'
              ? 'bg-fluent-accent-green/10 text-fluent-accent-green'
              : 'bg-fluent-accent-red/10 text-fluent-accent-red'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
