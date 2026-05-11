'use client';

import { useState } from 'react';

type Recipient = { email: string; name: string | null };

type Delivery = {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'failed';
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  openCount: number;
  errorMessage: string | null;
};

/**
 * Side panel on the meeting detail page that:
 *   1. Opens the MoM email composer modal (pick recipients + extra emails)
 *   2. Lists all past deliveries with live open-tracking status
 *   3. Lets admin refresh status (polls Mailgun events)
 *   4. Provides "Preview HTML" and "Download .html" links
 */
export function MomPanel({
  meetingId,
  meetingSubject,
  suggestedRecipients,
  initialDeliveries,
}: {
  meetingId: string;
  meetingSubject: string;
  suggestedRecipients: Recipient[];
  initialDeliveries: Delivery[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/refresh-deliveries`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setRefreshMsg(`Σφάλμα: ${data.error}`);
        return;
      }
      // Reload by re-fetching via a small endpoint — or just trigger a refetch from server.
      // Simplest: reload the whole page so the server-rendered table refreshes.
      window.location.reload();
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Πρακτικά (MoM)</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Στείλε επίσημα πρακτικά σύσκεψης με Microsoft-style format, παρακολούθηση
            παραλαβής + opens μέσω Mailgun.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={`/api/meetings/${meetingId}/mom-preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            Preview
          </a>
          <a
            href={`/api/meetings/${meetingId}/mom-preview?download=1`}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            Download .html
          </a>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Αποστολή σε…
          </button>
        </div>
      </div>

      {deliveries.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-gray-700">
              Παραδόσεις ({deliveries.length})
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:text-gray-400"
            >
              {refreshing ? 'Ενημέρωση…' : '↻ Refresh status'}
            </button>
          </div>
          <div className="overflow-hidden rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">Recipient</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">Status</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">Sent</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">Opened</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-medium">{d.recipientName ?? d.recipientEmail}</div>
                      {d.recipientName && (
                        <div className="text-gray-500">{d.recipientEmail}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={d.status} />
                      {d.status === 'failed' && d.errorMessage && (
                        <div className="mt-1 text-[10px] text-red-600">{d.errorMessage.slice(0, 100)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {d.sentAt ? formatDateTime(d.sentAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {d.openedAt ? (
                        <>
                          {formatDateTime(d.openedAt)}
                          {d.openCount > 1 && (
                            <span className="ml-1 rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
                              ×{d.openCount}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {refreshMsg && <div className="mt-2 text-xs text-red-600">{refreshMsg}</div>}
        </div>
      )}

      {modalOpen && (
        <MomModal
          meetingId={meetingId}
          meetingSubject={meetingSubject}
          suggestedRecipients={suggestedRecipients}
          onClose={() => setModalOpen(false)}
          onSent={(result) => {
            // Optimistic: append result.delivered to local state with status=sent.
            const newDeliveries: Delivery[] = result.delivered.map((d) => ({
              id: d.deliveryId,
              recipientEmail: d.recipient,
              recipientName: null,
              subject: meetingSubject,
              status: 'sent' as const,
              sentAt: new Date().toISOString(),
              deliveredAt: null,
              openedAt: null,
              openCount: 0,
              errorMessage: null,
            }));
            setDeliveries((prev) => [...newDeliveries, ...prev]);
            setModalOpen(false);
          }}
        />
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: Delivery['status'] }) {
  const map: Record<Delivery['status'], { cls: string; label: string }> = {
    queued: { cls: 'bg-gray-100 text-gray-700', label: 'queued' },
    sent: { cls: 'bg-blue-100 text-blue-700', label: 'sent' },
    delivered: { cls: 'bg-cyan-100 text-cyan-700', label: 'delivered' },
    opened: { cls: 'bg-green-100 text-green-700', label: '✓ opened' },
    failed: { cls: 'bg-red-100 text-red-700', label: 'failed' },
  };
  const { cls, label } = map[status];
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ─────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────

type SendResult = {
  delivered: Array<{ deliveryId: string; recipient: string; mailgunMessageId: string | null }>;
  failed: Array<{ recipient: string; error: string }>;
};

function MomModal({
  meetingId,
  meetingSubject,
  suggestedRecipients,
  onClose,
  onSent,
}: {
  meetingId: string;
  meetingSubject: string;
  suggestedRecipients: Recipient[];
  onClose: () => void;
  onSent: (result: SendResult) => void;
}) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [extraEmails, setExtraEmails] = useState('');
  const [subject, setSubject] = useState(`Πρακτικά: ${meetingSubject}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(email: string) {
    setPicked((s) => ({ ...s, [email]: !s[email] }));
  }

  async function send() {
    setError(null);
    const fromList = suggestedRecipients.filter((r) => picked[r.email]);
    const extras = extraEmails
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'))
      .map((email) => ({ email, name: null }));

    const recipients = [...fromList, ...extras];
    if (recipients.length === 0) {
      setError('Επίλεξε τουλάχιστον έναν παραλήπτη.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/send-mom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, subjectOverride: subject }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Σφάλμα αποστολής');
        return;
      }
      onSent(data as SendResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold">Αποστολή Πρακτικών (MoM)</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            ✕
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {suggestedRecipients.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Μέλη του project ({suggestedRecipients.length})
              </label>
              <div className="max-h-48 overflow-y-auto rounded border border-gray-200 p-2">
                {suggestedRecipients.map((r) => (
                  <label
                    key={r.email}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={picked[r.email] ?? false}
                      onChange={() => toggle(r.email)}
                      disabled={busy}
                    />
                    <span className="font-medium">{r.name ?? r.email}</span>
                    {r.name && <span className="text-xs text-gray-500">{r.email}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Επιπλέον email addresses (εξωτερικοί παραλήπτες)
            </label>
            <textarea
              rows={3}
              value={extraEmails}
              onChange={(e) => setExtraEmails(e.target.value)}
              placeholder="external1@example.com, external2@example.com"
              disabled={busy}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-gray-500">
              Διαχωρισμός με κόμμα, space ή newline.
            </p>
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50"
          >
            Ακύρωση
          </button>
          <button
            onClick={send}
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {busy ? 'Αποστολή…' : 'Αποστολή'}
          </button>
        </div>
      </div>
    </div>
  );
}
