'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type ProjectOption = {
  id: string;
  name: string;
  status: string;
};

type TeamsMeetingRow = {
  meetingId: string;
  subject: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  joinWebUrl: string | null;
  hasTranscript: boolean;
  hasRecording: boolean;
  transcriptCreatedAt: string | null;
  recordingCreatedAt: string | null;
  alreadyProcessedMeetingNoteId: string | null;
  alreadyProcessedProjectId: string | null;
};

type ApiResponse = {
  meetings: TeamsMeetingRow[];
  organizer: string;
  range: { start: string; end: string };
  counts: { total: number; transcripts: number; recordings: number };
  policyWarning?: string | null;
};

export function TeamsMeetingsBrowser({
  organizerEmail,
  projects,
}: {
  organizerEmail: string;
  projects: ProjectOption[];
}) {
  const [daysBack, setDaysBack] = useState(30);
  // Always start from the session email. If the session UPN doesn't match an
  // AAD user (e.g. session is on i4ria.com but AAD lives on dgsmart.gr), the
  // admin can override manually. We deliberately do NOT persist this in
  // localStorage — stale values across logins were causing empty results.
  const [organizerUpn, setOrganizerUpn] = useState(organizerEmail);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  // Per-row state
  const [selectedProject, setSelectedProject] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [processResults, setProcessResults] = useState<
    Record<string, { ok: true; meetingNoteId: string } | { ok: false; error: string }>
  >({});

  // Re-load whenever daysBack/organizerUpn changes (debounced via input blur).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/teams-meetings/list?daysBack=${daysBack}&organizer=${encodeURIComponent(organizerUpn)}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load meetings');
        setData(null);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [daysBack, organizerEmail]);

  // Auto-load on first mount and when filters change. organizerUpn changes
  // trigger a reload on blur (see input), to avoid one request per keystroke.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysBack, organizerEmail]);

  async function process(meetingId: string) {
    const projectId = selectedProject[meetingId];
    if (!projectId) {
      setProcessResults((s) => ({ ...s, [meetingId]: { ok: false, error: 'Pick a project first' } }));
      return;
    }
    setProcessing((s) => ({ ...s, [meetingId]: true }));
    setProcessResults((s) => ({ ...s, [meetingId]: undefined as never }));
    try {
      const res = await fetch('/api/meetings/poc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, meetingId, organizer: organizerUpn }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProcessResults((s) => ({
          ...s,
          [meetingId]: { ok: false, error: json.error ?? 'Processing failed' },
        }));
      } else {
        setProcessResults((s) => ({
          ...s,
          [meetingId]: { ok: true, meetingNoteId: json.meetingNoteId },
        }));
        // Refresh list to update "already processed" annotations
        setTimeout(() => load(), 500);
      }
    } catch (err) {
      setProcessResults((s) => ({
        ...s,
        [meetingId]: { ok: false, error: err instanceof Error ? err.message : 'Network error' },
      }));
    } finally {
      setProcessing((s) => ({ ...s, [meetingId]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <label className="text-sm font-medium">Organizer (AAD UPN):</label>
        <input
          type="email"
          value={organizerUpn}
          onChange={(e) => setOrganizerUpn(e.target.value)}
          onBlur={() => load()}
          placeholder="user@yourtenant.com"
          className="w-64 rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={loading}
        />
        <label className="text-sm font-medium">Διάστημα:</label>
        <select
          value={daysBack}
          onChange={(e) => setDaysBack(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={loading}
        >
          <option value={7}>7 ημέρες</option>
          <option value={14}>14 ημέρες</option>
          <option value={30}>30 ημέρες</option>
          <option value={60}>60 ημέρες</option>
          <option value={90}>90 ημέρες</option>
        </select>
        <button
          onClick={load}
          disabled={loading}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:bg-gray-300"
        >
          {loading ? 'Φόρτωση…' : 'Ανανέωση'}
        </button>
        {organizerUpn !== organizerEmail && (
          <button
            type="button"
            onClick={() => {
              setOrganizerUpn(organizerEmail);
              load();
            }}
            className="text-xs text-amber-700 underline"
          >
            Reset σε: {organizerEmail}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-medium">Σφάλμα φόρτωσης</div>
          <div className="mt-1 font-mono text-xs">{error}</div>
          {error.includes('403') && (
            <div className="mt-3 text-xs">
              Πιθανότατα λείπουν Microsoft Graph permissions. Δες το{' '}
              <code>MEETINGS_SOFTONE_SETUP.md</code> για το setup των{' '}
              <code>OnlineMeetingTranscript.Read.All</code> + application access policy.
            </div>
          )}
        </div>
      )}

      {data?.policyWarning && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="font-semibold text-amber-900">
            ⚠ Application Access Policy μη ενεργό
          </div>
          <p className="mt-1 text-amber-800">
            Τα meetings εμφανίζονται αλλά <strong>δεν θα μπορούν να αποδελτιωθούν</strong> μέχρι
            να εφαρμοστεί η Teams policy. Το Graph μπλοκάρει το access σε συγκεκριμένα meetings:
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-amber-100 px-3 py-2 text-[11px] text-amber-900">{`# Εκτέλεσε σε Microsoft Teams PowerShell:
Connect-MicrosoftTeams

New-CsApplicationAccessPolicy \`
  -Identity "FluentPmPolicy" \`
  -AppIds "4f369876-4591-4343-b713-21b43ee425cc" \`
  -Description "fluent-pm meeting access"

Grant-CsApplicationAccessPolicy \`
  -PolicyName "FluentPmPolicy" \`
  -Identity "${organizerUpn}"`}</pre>
          <p className="mt-2 text-[11px] text-amber-700">
            Η εφαρμογή του policy παίρνει 30-60 λεπτά να propagateθεί.
          </p>
        </div>
      )}

      {data && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
            {data.counts.total} συσκέψεις · {data.counts.transcripts} transcripts ·{' '}
            {data.counts.recordings} recordings
          </div>

          {data.meetings.length === 0 ? (
            <div className="p-8 text-sm text-gray-600">
              <div className="text-center font-medium">
                Δεν βρέθηκαν meetings με transcript/recording για <code>{organizerUpn}</code>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Πιθανές αιτίες:
                <ul className="mt-2 ml-5 list-disc space-y-1">
                  <li>
                    Ο επιλεγμένος user δεν έχει meetings ως <strong>organizer</strong> στις
                    τελευταίες {daysBack} ημέρες (αν συμμετείχες αλλά δεν διοργάνωσες, δεν
                    εμφανίζεται).
                  </li>
                  <li>Το transcription δεν ήταν enabled κατά τη συνάντηση.</li>
                  <li>
                    Λείπει η <code>Application Access Policy</code> για τον user στο Teams
                    PowerShell (αλλιώς θα ήταν 403 αντί για 0 results).
                  </li>
                  <li>Το UPN στο πεδίο πάνω αριστερά είναι λάθος — επιβεβαίωσε ότι ταιριάζει
                    το Azure AD UPN, όχι το alias σου.
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.meetings.map((m) => (
                <li key={m.meetingId} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {m.subject ?? (
                          <span className="text-gray-500">
                            Σύσκεψη — {formatDate(m.transcriptCreatedAt ?? m.recordingCreatedAt)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{formatDate(m.startDateTime ?? m.transcriptCreatedAt)}</span>
                        {m.startDateTime && m.endDateTime && (
                          <span>· {formatDuration(m.startDateTime, m.endDateTime)}</span>
                        )}
                        {m.hasTranscript && (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">transcript</span>
                        )}
                        {m.hasRecording && (
                          <span className="rounded bg-purple-50 px-2 py-0.5 text-purple-700">recording</span>
                        )}
                        <code className="rounded bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400">
                          {m.meetingId.slice(0, 24)}…
                        </code>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {m.alreadyProcessedMeetingNoteId && m.alreadyProcessedProjectId ? (
                        <Link
                          href={`/projects/${m.alreadyProcessedProjectId}/meetings/${m.alreadyProcessedMeetingNoteId}`}
                          className="inline-block rounded border border-green-600 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                        >
                          ✓ Ήδη επεξεργασμένο — δες notes
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedProject[m.meetingId] ?? ''}
                            onChange={(e) =>
                              setSelectedProject((s) => ({ ...s, [m.meetingId]: e.target.value }))
                            }
                            disabled={processing[m.meetingId] || !m.hasTranscript}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Επίλεξε project…</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.status !== 'active' && `(${p.status})`}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => process(m.meetingId)}
                            disabled={
                              processing[m.meetingId] ||
                              !selectedProject[m.meetingId] ||
                              !m.hasTranscript
                            }
                            title={!m.hasTranscript ? 'No transcript available' : ''}
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:bg-gray-300"
                          >
                            {processing[m.meetingId] ? 'Επεξεργασία…' : 'Αποδελτίωση'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {processResults[m.meetingId] && (
                    <div className="text-xs">
                      {processResults[m.meetingId].ok ? (
                        <div className="rounded bg-green-50 px-3 py-1.5 text-green-700">
                          ✓ Δημιουργήθηκαν notes —{' '}
                          <Link
                            href={`/projects/${selectedProject[m.meetingId]}/meetings/${
                              (processResults[m.meetingId] as { meetingNoteId: string }).meetingNoteId
                            }`}
                            className="underline"
                          >
                            δες αποτελέσματα
                          </Link>
                        </div>
                      ) : (
                        <div className="rounded bg-red-50 px-3 py-1.5 text-red-700">
                          ✗ {(processResults[m.meetingId] as { error: string }).error}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDuration(startIso: string, endIso: string): string {
  const sec = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} λεπτά`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}ώ ${rem}λ`;
}
