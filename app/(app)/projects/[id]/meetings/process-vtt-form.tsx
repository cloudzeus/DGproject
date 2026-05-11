'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProcessVttForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [vtt, setVtt] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    meetingNoteId: string;
    actionItemsExtracted: number;
  } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!vtt.trim()) {
      setError('Το VTT δεν μπορεί να είναι κενό.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/meetings/poc-vtt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          vtt,
          subject: subject.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Άγνωστο σφάλμα.');
        return;
      }
      setSuccess(data);
      setVtt('');
      setSubject('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Subject (προαιρετικό)</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="π.χ. Weekly sync Milwaukee data"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={busy}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">VTT transcript</label>
        <textarea
          value={vtt}
          onChange={(e) => setVtt(e.target.value)}
          placeholder="WEBVTT&#10;&#10;00:00:01.000 --> 00:00:05.000&#10;<v Speaker Name>Text here</v>&#10;..."
          rows={12}
          className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
          disabled={busy}
          required
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !vtt.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
        >
          {busy ? 'Επεξεργασία...' : 'Αποδελτίωση'}
        </button>
        {busy && (
          <span className="text-xs text-gray-500">
            ~15-30 δευτερόλεπτα ανάλογα με μέγεθος transcript
          </span>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          ✓ Αποδελτίωση ολοκληρώθηκε — {success.actionItemsExtracted} action items εντοπίστηκαν.{' '}
          <a
            href={`/projects/${projectId}/meetings/${success.meetingNoteId}`}
            className="underline font-medium"
          >
            Άνοιγμα →
          </a>{' '}
          για να αναθέσεις τα tasks σε projects.
        </div>
      )}
    </form>
  );
}
