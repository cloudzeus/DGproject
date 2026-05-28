'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Recipient = { email: string; name: string | null };

type Insights = {
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
 * Interactive full-page MoM preview. Every item has a checkbox; only checked
 * items get sent. Right side renders the live HTML preview via iframe (the
 * same renderer used by the email body).
 */
export function MomFullPreview({
  meetingId,
  projectId,
  meetingSubject,
  suggestedRecipients,
  insights,
}: {
  meetingId: string;
  projectId: string;
  meetingSubject: string;
  suggestedRecipients: Recipient[];
  insights: Insights;
}) {
  const [includeSummary, setIncludeSummary] = useState<boolean>(Boolean(insights.summary));
  const [keptDecisions, setKeptDecisions] = useState<boolean[]>(
    insights.decisions.map(() => true),
  );
  const [keptActions, setKeptActions] = useState<boolean[]>(
    insights.actionItems.map(() => true),
  );
  const [keptRisks, setKeptRisks] = useState<boolean[]>(insights.risks.map(() => true));
  const [keptQuestions, setKeptQuestions] = useState<boolean[]>(
    insights.openQuestions.map(() => true),
  );

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [extraEmails, setExtraEmails] = useState('');
  const [subject, setSubject] = useState(`Πρακτικά: ${meetingSubject}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentSummary, setSentSummary] = useState<string | null>(null);

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
    const p = new URLSearchParams();
    p.set('summary', include.summary ? '1' : '0');
    p.set('d', include.decisionIndexes.join(','));
    p.set('a', include.actionItemIndexes.join(','));
    p.set('r', include.riskIndexes.join(','));
    p.set('q', include.openQuestionIndexes.join(','));
    return `/api/meetings/${meetingId}/mom-preview?${p.toString()}`;
  }, [meetingId, include]);

  function toggleAt(setter: React.Dispatch<React.SetStateAction<boolean[]>>, i: number) {
    setter((arr) => arr.map((v, idx) => (idx === i ? !v : v)));
  }
  function setAll(setter: React.Dispatch<React.SetStateAction<boolean[]>>, value: boolean) {
    setter((arr) => arr.map(() => value));
  }

  async function send() {
    setError(null);
    setSentSummary(null);
    const fromList = suggestedRecipients.filter((r) => picked[r.email]);
    const extras = extraEmails
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'))
      .map((email) => ({ email, name: null as string | null }));
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
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSentSummary(
        `✓ Στάλθηκαν σε ${data.delivered.length} παραλήπτες${
          data.failed.length ? ` (αποτυχίες: ${data.failed.length})` : ''
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/projects/${projectId}/meetings/${meetingId}`}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Επιστροφή στη σύσκεψη
        </Link>
        <h1 className="text-xl font-semibold">Πλήρες Preview Πρακτικών</h1>
        <div />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
        {/* ───────── LEFT: checkbox curation panel ───────── */}
        <div className="space-y-4">
          <Section title="Subject">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </Section>

          {insights.summary && (
            <Section title="Περίληψη">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={() => setIncludeSummary((v) => !v)}
                  className="mt-1"
                />
                <span className={includeSummary ? '' : 'text-gray-400 line-through'}>
                  {insights.summary}
                </span>
              </label>
            </Section>
          )}

          {insights.decisions.length > 0 && (
            <CheckboxList
              title="Αποφάσεις"
              items={insights.decisions.map((d) => d.text)}
              kept={keptDecisions}
              onToggle={(i) => toggleAt(setKeptDecisions, i)}
              onAll={(v) => setAll(setKeptDecisions, v)}
            />
          )}

          {insights.actionItems.length > 0 && (
            <CheckboxList
              title="Action items"
              items={insights.actionItems.map(
                (a) =>
                  `${a.title}${a.assigneeEmail ? ` · ${a.assigneeEmail}` : ''} · ${a.priority} · ${Math.round(a.confidence * 100)}%`,
              )}
              kept={keptActions}
              onToggle={(i) => toggleAt(setKeptActions, i)}
              onAll={(v) => setAll(setKeptActions, v)}
            />
          )}

          {insights.risks.length > 0 && (
            <CheckboxList
              title="Ρίσκα"
              items={insights.risks.map((r) => `[${r.severity}] ${r.text}`)}
              kept={keptRisks}
              onToggle={(i) => toggleAt(setKeptRisks, i)}
              onAll={(v) => setAll(setKeptRisks, v)}
            />
          )}

          {insights.openQuestions.length > 0 && (
            <CheckboxList
              title="Ανοιχτά ερωτήματα"
              items={insights.openQuestions.map((q) => q.question)}
              kept={keptQuestions}
              onToggle={(i) => toggleAt(setKeptQuestions, i)}
              onAll={(v) => setAll(setKeptQuestions, v)}
            />
          )}

          {suggestedRecipients.length > 0 && (
            <Section title={`Παραλήπτες (${suggestedRecipients.length})`}>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {suggestedRecipients.map((r) => (
                  <label
                    key={r.email}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={picked[r.email] ?? false}
                      onChange={() =>
                        setPicked((s) => ({ ...s, [r.email]: !s[r.email] }))
                      }
                      disabled={busy}
                    />
                    <span className="font-medium">{r.name ?? r.email}</span>
                    {r.name && <span className="text-xs text-gray-500">{r.email}</span>}
                  </label>
                ))}
              </div>
            </Section>
          )}

          <Section title="Επιπλέον email (εξωτερικοί)">
            <textarea
              rows={2}
              value={extraEmails}
              onChange={(e) => setExtraEmails(e.target.value)}
              placeholder="external@example.com, …"
              disabled={busy}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </Section>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {sentSummary && (
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {sentSummary}
            </div>
          )}

          <button
            onClick={send}
            disabled={busy}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {busy ? 'Αποστολή…' : 'Αποστολή με αυτή την επιλογή'}
          </button>
        </div>

        {/* ───────── RIGHT: live preview iframe ───────── */}
        <div className="sticky top-4 h-[calc(100vh-6rem)]">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>Live preview — ενημερώνεται καθώς τσεκάρεις</span>
            <a
              href={previewUrl + '&download=1'}
              className="text-blue-600 hover:underline"
            >
              ⬇ Download .html
            </a>
          </div>
          <iframe
            key={previewUrl}
            src={previewUrl}
            className="h-full w-full rounded border border-gray-200 bg-white"
            title="MoM preview"
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
        {title}
      </div>
      {children}
    </div>
  );
}

function CheckboxList({
  title,
  items,
  kept,
  onToggle,
  onAll,
}: {
  title: string;
  items: string[];
  kept: boolean[];
  onToggle: (i: number) => void;
  onAll: (v: boolean) => void;
}) {
  const includedCount = kept.filter(Boolean).length;
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
          {title} ({includedCount}/{items.length})
        </div>
        <div className="flex gap-2 text-[11px]">
          <button onClick={() => onAll(true)} className="text-blue-600 hover:underline">
            όλα
          </button>
          <button onClick={() => onAll(false)} className="text-gray-500 hover:underline">
            κανένα
          </button>
        </div>
      </div>
      <ul className="space-y-1">
        {items.map((text, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50">
              <input
                type="checkbox"
                checked={kept[i]}
                onChange={() => onToggle(i)}
                className="mt-0.5"
              />
              <span
                className={`flex-1 break-words ${
                  kept[i] ? 'text-gray-800' : 'text-gray-400 line-through'
                }`}
              >
                {text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
