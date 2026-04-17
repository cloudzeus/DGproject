'use client';

import { useState, useTransition } from 'react';
import { CheckmarkCircle16Filled, ArrowSync20Regular, Warning20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { testSoftOne, resetSoftOneSession } from './softone-actions';
import type { SoftOneStatus } from '@/lib/softone';

export function SoftOnePanel() {
  const [status, setStatus] = useState<SoftOneStatus | null>(null);
  const [pending, startTransition] = useTransition();

  function handleTest() {
    startTransition(async () => {
      const res = await testSoftOne();
      setStatus(res);
    });
  }

  function handleReset() {
    startTransition(async () => {
      const res = await resetSoftOneSession();
      setStatus(res);
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-semibold">SoftOne ERP Integration</h2>
            <p className="text-sm text-fluent-neutral-60 mt-1">
              Σύνδεση με το SoftOne ERP για μεταφορά δεδομένων σε Πελάτες και Έργα.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowSync20Regular />}
            onClick={handleTest}
            disabled={pending}
          >
            {pending ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}
          </Button>
        </div>

        {status && (
          <div
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              status.ok
                ? 'bg-green-50 border-green-200'
                : 'bg-orange-50 border-orange-200'
            }`}
          >
            {status.ok ? (
              <CheckmarkCircle16Filled className="text-fluent-accent-green mt-0.5 shrink-0" />
            ) : (
              <Warning20Regular className="text-fluent-accent-orange mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0 text-sm">
              {status.ok ? (
                <>
                  <p className="font-semibold text-fluent-neutral-90">
                    Σύνδεση επιτυχής {status.sessionCached && '(από cache)'}
                  </p>
                  <p className="text-xs text-fluent-neutral-60 mt-0.5">
                    Serial: <span className="font-mono">{status.serial}</span> · Company:{' '}
                    {status.company} · Client ID: {status.clientId}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-fluent-neutral-90">Αποτυχία σύνδεσης</p>
                  <p className="text-xs text-fluent-neutral-60 mt-0.5 break-words">
                    {status.error}
                  </p>
                </>
              )}
            </div>
            {status.ok && (
              <Button variant="secondary" size="sm" onClick={handleReset} disabled={pending}>
                Επαναφορά session
              </Button>
            )}
          </div>
        )}

        {!status && (
          <p className="text-sm text-fluent-neutral-60">
            Πάτα <strong>Δοκιμή σύνδεσης</strong> για να επαληθεύσεις ότι ο client μπορεί να
            συνδεθεί στο SoftOne με τα τρέχοντα credentials.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ScopeCard
          title="Πελάτες"
          description="Συγχρονισμός λίστας πελατών από το SoftOne (CUSTOMER)."
          status={status?.ok ? 'ready' : 'pending'}
        />
        <ScopeCard
          title="Έργα"
          description="Αντιστοίχιση έργων με τα αρχεία πελατών του SoftOne."
          status={status?.ok ? 'ready' : 'pending'}
        />
      </div>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
        <h3 className="font-display font-semibold text-fluent-neutral-90 mb-3">
          Ρυθμίσεις σύνδεσης
        </h3>
        <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <dt className="text-fluent-neutral-60">Serial</dt>
          <dd className="font-mono text-fluent-neutral-90">
            {process.env.NEXT_PUBLIC_S1_SERIAL_DISPLAY ?? '—'}
          </dd>
          <dt className="text-fluent-neutral-60">Base URL</dt>
          <dd className="font-mono text-fluent-neutral-90">{'https://{serial}.oncloud.gr/s1services'}</dd>
          <dt className="text-fluent-neutral-60">Auth flow</dt>
          <dd className="text-fluent-neutral-90">Login → authenticate (cached clientID ανά ημέρα)</dd>
          <dt className="text-fluent-neutral-60">Encoding</dt>
          <dd className="font-mono text-fluent-neutral-90">win1253</dd>
        </dl>
        <p className="text-xs text-fluent-neutral-60 mt-4">
          Οι μεταβλητές <code>S1_SERIAL</code>, <code>S1_USERNAME</code>, <code>S1_PASSWORD</code>,{' '}
          <code>S1_APP_ID</code>, <code>S1_COMPANY</code>, <code>S1_BRANCH</code>,{' '}
          <code>S1_MODULE</code>, <code>S1_REFID</code> πρέπει να είναι ορισμένες στο{' '}
          <code>.env</code>.
        </p>
      </div>
    </div>
  );
}

function ScopeCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: 'ready' | 'pending';
}) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-5">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="font-display font-semibold text-fluent-neutral-90">{title}</h3>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            status === 'ready'
              ? 'bg-green-50 border-green-200 text-fluent-accent-green'
              : 'bg-fluent-neutral-8 border-fluent-neutral-20 text-fluent-neutral-60'
          }`}
        >
          {status === 'ready' ? 'Έτοιμο' : 'Εκκρεμεί σύνδεση'}
        </span>
      </div>
      <p className="text-sm text-fluent-neutral-60">{description}</p>
    </div>
  );
}
