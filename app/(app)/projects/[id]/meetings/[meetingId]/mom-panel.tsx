'use client';

import { useMemo, useState } from 'react';

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

export type MomInsightsPreview = {
  summary: string | null;
  decisions: Array<{ text: string; timestampSec: number }>;
  actionItems: Array<{
    title: string;
    assigneeEmail: string | null;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    confidence: number;
  }>;
  risks: Array<{ text: string; severity: 'low' | 'medium' | 'high' }>;
  openQuestions: Array<{ question: string }>;
};

/**
 * Side panel on the meeting detail page that:
 *   1. Opens the MoM email composer modal (pick recipients + curate content)
 *   2. Lists past deliveries with live open-tracking status
 *   3. Lets admin refresh status (polls Mailgun events)
 *   4. Provides "Preview HTML" and "Download .html" links
 */
export function MomPanel({
  meetingId,
  meetingSubject,
  suggestedRecipients,
  insights,
  initialDeliveries,
}: {
  meetingId: string;
  meetingSubject: string;
  suggestedRecipients: Recipient[];
  insights: MomInsightsPreview;
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
            Στείλε επίσημα πρακτικά σύσκεψης με Microsoft-style format. Επίλεξε ποια ενότητες
            και ποια items θα συμπεριληφθούν.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={`/api/meetings/${meetingId}/mom-preview`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            Πλήρες Preview
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
                        <div className="mt-1 text-[10px] text-red-600">
                          {d.errorMessage.slice(0, 100)}
                        </div>
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
          insights={insights}
          onClose={() => setModalOpen(false)}
          onSent={(result) => {
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
  insights,
  onClose,
  onSent,
}: {
  meetingId: string;
  meetingSubject: string;
  suggestedRecipients: Recipient[];
  insights: MomInsightsPreview;
  onClose: () => void;
  onSent: (result: SendResult) => void;
}) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [extraEmails, setExtraEmails] = useState('');
  const [subject, setSubject] = useState(`Πρακτικά: ${meetingSubject}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-section selection state. Start with everything kept (all indexes included).
  const [includeSummary, setIncludeSummary] = useState<boolean>(Boolean(insights.summary));
  const [keptDecisions, setKeptDecisions] = useState<boolean[]>(
    () => insights.decisions.map(() => true),
  );
  const [keptActions, setKeptActions] = useState<boolean[]>(
    () => insights.actionItems.map(() => true),
  );
  const [keptRisks, setKeptRisks] = useState<boolean[]>(() => insights.risks.map(() => true));
  const [keptQuestions, setKeptQuestions] = useState<boolean[]>(
    () => insights.openQuestions.map(() => true),
  );

  function toggle(email: string) {
    setPicked((s) => ({ ...s, [email]: !s[email] }));
  }

  function removeAt(setter: React.Dispatch<React.SetStateAction<boolean[]>>) {
    return (idx: number) => setter((arr) => arr.map((v, i) => (i === idx ? false : v)));
  }
  function restoreAt(setter: React.Dispatch<React.SetStateAction<boolean[]>>) {
    return (idx: number) => setter((arr) => arr.map((v, i) => (i === idx ? true : v)));
  }
  function toggleSection(setter: React.Dispatch<React.SetStateAction<boolean[]>>) {
    return () =>
      setter((arr) => {
        const anyOff = arr.some((v) => !v);
        return arr.map(() => anyOff);
      });
  }

  // Build the filter that goes to the server. Use index lists rather than
  // booleans so the server can preserve ordering and skip missing items.
  const include = useMemo(
    () => ({
      summary: includeSummary,
      decisionIndexes: keptDecisions.flatMap((v, i) => (v ? [i] : [])),
      actionItemIndexes: keptActions.flatMap((v, i) => (v ? [i] : [])),
      riskIndexes: keptRisks.flatMap((v, i) => (v ? [i] : [])),
      openQuestionIndexes: keptQuestions.flatMap((v, i) => (v ? [i] : [])),
    }),
    [includeSummary, keptDecisions, keptActions, keptRisks, keptQuestions],
  );

  const previewUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('summary', include.summary ? '1' : '0');
    params.set('d', include.decisionIndexes.join(','));
    params.set('a', include.actionItemIndexes.join(','));
    params.set('r', include.riskIndexes.join(','));
    params.set('q', include.openQuestionIndexes.join(','));
    return `/api/meetings/${meetingId}/mom-preview?${params.toString()}`;
  }, [meetingId, include]);

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
        body: JSON.stringify({ recipients, subjectOverride: subject, include }),
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
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold">Αποστολή Πρακτικών (MoM)</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
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

          {/* ─────── Sections to include ─────── */}
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Περιεχόμενα προς αποστολή
              </div>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Preview με αυτή την επιλογή ↗
              </a>
            </div>

            {/* Summary */}
            {insights.summary && (
              <SectionRow
                label="Περίληψη"
                included={includeSummary}
                count={null}
                onToggleSection={() => setIncludeSummary((v) => !v)}
              />
            )}

            {/* Decisions */}
            {insights.decisions.length > 0 && (
              <ItemSection
                label="Αποφάσεις"
                items={insights.decisions.map((d) => d.text)}
                kept={keptDecisions}
                onToggleSection={toggleSection(setKeptDecisions)}
                onRemove={removeAt(setKeptDecisions)}
                onRestore={restoreAt(setKeptDecisions)}
              />
            )}

            {/* Action items */}
            {insights.actionItems.length > 0 && (
              <ItemSection
                label="Action items"
                items={insights.actionItems.map(
                  (a) =>
                    `${a.title}${a.assigneeEmail ? ` · ${a.assigneeEmail}` : ''} · ${a.priority} · ${Math.round(a.confidence * 100)}%`,
                )}
                kept={keptActions}
                onToggleSection={toggleSection(setKeptActions)}
                onRemove={removeAt(setKeptActions)}
                onRestore={restoreAt(setKeptActions)}
              />
            )}

            {/* Risks */}
            {insights.risks.length > 0 && (
              <ItemSection
                label="Ρίσκα"
                items={insights.risks.map((r) => `[${r.severity}] ${r.text}`)}
                kept={keptRisks}
                onToggleSection={toggleSection(setKeptRisks)}
                onRemove={removeAt(setKeptRisks)}
                onRestore={restoreAt(setKeptRisks)}
              />
            )}

            {/* Open questions */}
            {insights.openQuestions.length > 0 && (
              <ItemSection
                label="Ανοιχτά ερωτήματα"
                items={insights.openQuestions.map((q) => q.question)}
                kept={keptQuestions}
                onToggleSection={toggleSection(setKeptQuestions)}
                onRemove={removeAt(setKeptQuestions)}
                onRestore={restoreAt(setKeptQuestions)}
              />
            )}
          </div>

          {/* ─────── Recipients ─────── */}
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

// ─── UI building blocks ──────────────────────────────────────────────────

function SectionRow({
  label,
  included,
  count,
  onToggleSection,
}: {
  label: string;
  included: boolean;
  count: number | null;
  onToggleSection: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-gray-200 py-2 first:border-t-0">
      <input
        type="checkbox"
        checked={included}
        onChange={onToggleSection}
        className="h-3.5 w-3.5"
      />
      <span className="text-sm font-medium">{label}</span>
      {count !== null && (
        <span className="text-xs text-gray-500">
          ({count})
        </span>
      )}
    </div>
  );
}

function ItemSection({
  label,
  items,
  kept,
  onToggleSection,
  onRemove,
  onRestore,
}: {
  label: string;
  items: string[];
  kept: boolean[];
  onToggleSection: () => void;
  onRemove: (i: number) => void;
  onRestore: (i: number) => void;
}) {
  const includedCount = kept.filter(Boolean).length;
  return (
    <div className="border-t border-gray-200 py-2 first:border-t-0">
      <div className="mb-1 flex items-center gap-2">
        <input
          type="checkbox"
          checked={includedCount === items.length}
          ref={(el) => {
            if (el) el.indeterminate = includedCount > 0 && includedCount < items.length;
          }}
          onChange={onToggleSection}
          className="h-3.5 w-3.5"
        />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-gray-500">
          ({includedCount}/{items.length})
        </span>
      </div>
      <ul className="ml-6 space-y-1">
        {items.map((text, i) => {
          const isKept = kept[i];
          return (
            <li
              key={i}
              className={`flex items-start gap-2 rounded px-2 py-1 text-xs ${
                isKept ? 'text-gray-800' : 'text-gray-400 line-through'
              }`}
            >
              <span className="flex-1 break-words">{text}</span>
              <button
                type="button"
                onClick={() => (isKept ? onRemove(i) : onRestore(i))}
                title={isKept ? 'Αφαίρεση' : 'Επαναφορά'}
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                  isKept
                    ? 'text-red-500 hover:bg-red-50'
                    : 'text-blue-500 hover:bg-blue-50'
                }`}
              >
                {isKept ? '✕' : '↺'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
