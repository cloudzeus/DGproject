'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type ProjectOption = { id: string; name: string };

type Row = {
  id: string;
  teamsMeetingId: string;
  organizerEmail: string;
  subject: string | null;
  startedAt: string | null;
  endedAt: string | null;
  joinWebUrl: string | null;
  hasTranscript: boolean;
  hasRecording: boolean;
  transcriptCreatedAt: string | null;
  recordingCreatedAt: string | null;
  promotedMeetingNoteId: string | null;
  promotedAt: string | null;
  discoveredAt: string;
  promotedNote: { id: string; projectId: string; status: string; project: { name: string } } | null;
};

export default function AdminMeetingsBrowser({ projects }: { projects: ProjectOption[] }) {
  const [daysBack, setDaysBack] = useState(30);
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'promoted'>('unassigned');
  const [organizerFilter, setOrganizerFilter] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<
    Record<string, { ok: true; meetingNoteId: string } | { ok: false; error: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ daysBack: String(daysBack) });
      if (filter !== 'all') params.set('status', filter);
      if (organizerFilter) params.set('organizer', organizerFilter);
      const res = await fetch(`/api/admin/meetings?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.meetings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [daysBack, filter, organizerFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const runIngest = async () => {
    setIngesting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 7 }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIngesting(false);
    }
  };

  const process = async (id: string) => {
    const projectId = selectedProject[id];
    if (!projectId) {
      setResults((r) => ({ ...r, [id]: { ok: false, error: 'Επίλεξε project' } }));
      return;
    }
    setProcessing((p) => ({ ...p, [id]: true }));
    setResults((r) => {
      const { [id]: _omit, ...rest } = r;
      return rest;
    });
    try {
      const res = await fetch(`/api/admin/meetings/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults((r) => ({ ...r, [id]: { ok: false, error: data.error ?? `HTTP ${res.status}` } }));
      } else {
        setResults((r) => ({ ...r, [id]: { ok: true, meetingNoteId: data.meetingNoteId } }));
        await load();
      }
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { ok: false, error: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Όλα τα Recorded Meetings</h1>
        <button
          onClick={runIngest}
          disabled={ingesting}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {ingesting ? 'Συγχρονισμός…' : 'Συγχρονισμός τώρα (7 ημέρες)'}
        </button>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <label className="text-sm">
          Ημέρες πίσω
          <input
            type="number"
            min={1}
            max={180}
            value={daysBack}
            onChange={(e) => setDaysBack(Math.max(1, Math.min(180, Number(e.target.value))))}
            className="ml-2 border rounded px-2 py-1 w-20"
          />
        </label>
        <label className="text-sm">
          Κατάσταση
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="ml-2 border rounded px-2 py-1"
          >
            <option value="unassigned">Μη επεξεργασμένα</option>
            <option value="promoted">Επεξεργασμένα</option>
            <option value="all">Όλα</option>
          </select>
        </label>
        <label className="text-sm">
          Organizer
          <input
            type="email"
            placeholder="(όλοι)"
            value={organizerFilter}
            onChange={(e) => setOrganizerFilter(e.target.value)}
            className="ml-2 border rounded px-2 py-1 w-64"
          />
        </label>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading ? (
        <div>Φόρτωση…</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-500 text-sm">
          Καμία εγγραφή. Πάτα «Συγχρονισμός τώρα» για να τραβήξεις από Microsoft Graph.
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Subject</th>
              <th>Organizer</th>
              <th>Πότε</th>
              <th>Διαθέσιμα</th>
              <th>Κατάσταση / Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="py-2 pr-2 max-w-xs">{r.subject ?? <em>(χωρίς θέμα)</em>}</td>
                <td className="pr-2">{r.organizerEmail}</td>
                <td className="pr-2 whitespace-nowrap">
                  {r.startedAt ? new Date(r.startedAt).toLocaleString('el-GR') : '—'}
                </td>
                <td className="pr-2">
                  {r.hasTranscript && <span className="mr-1">📝</span>}
                  {r.hasRecording && <span>🎥</span>}
                </td>
                <td>
                  {r.promotedNote ? (
                    <div className="text-green-700">
                      ✅ {r.promotedNote.status} —{' '}
                      <Link
                        href={`/projects/${r.promotedNote.projectId}/meetings/${r.promotedNote.id}`}
                        className="underline"
                      >
                        {r.promotedNote.project.name}
                      </Link>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center flex-wrap">
                      <select
                        value={selectedProject[r.id] ?? ''}
                        onChange={(e) =>
                          setSelectedProject((s) => ({ ...s, [r.id]: e.target.value }))
                        }
                        className="border rounded px-2 py-1"
                      >
                        <option value="">— επίλεξε project —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => process(r.id)}
                        disabled={processing[r.id] || !r.hasTranscript}
                        className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50"
                        title={!r.hasTranscript ? 'Δεν υπάρχει transcript' : ''}
                      >
                        {processing[r.id] ? 'Επεξεργασία…' : 'Process'}
                      </button>
                      {(() => {
                        const res = results[r.id];
                        return res && !res.ok ? (
                          <span className="text-red-600 text-xs">{res.error}</span>
                        ) : null;
                      })()}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
