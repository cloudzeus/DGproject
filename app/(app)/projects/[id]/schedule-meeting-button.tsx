'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video20Regular } from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';

type MemberOption = { id: string; name: string; email: string };

/**
 * "Δημιουργία Teams σύσκεψης" action button on the project page.
 *
 * Opens a modal where admin picks:
 *   - subject + start/end datetime
 *   - organizer UPN (defaults to session email, override when AAD UPN differs)
 *   - which project members to invite (checkboxes, all checked by default)
 *   - free-form external email addresses
 *
 * Submit fires POST /api/projects/:id/schedule-meeting which:
 *   1. Creates a Teams meeting + calendar event in one Graph call
 *   2. Sends invitation emails via Outlook
 *   3. Persists a MeetingNote with status='scheduled' so when the transcript
 *      becomes available, /teams-meetings auto-targets this project.
 */
export function ScheduleMeetingButton({
  projectId,
  projectName,
  members,
  sessionEmail,
}: {
  projectId: string;
  projectName: string;
  members: MemberOption[];
  sessionEmail: string;
}) {
  const [open, setOpen] = useState(false);
  if (members.length === 0 && !sessionEmail) return null;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<Video20Regular />}
        onClick={() => setOpen(true)}
      >
        Teams σύσκεψη
      </Button>
      {open && (
        <ScheduleMeetingModal
          projectId={projectId}
          projectName={projectName}
          members={members}
          sessionEmail={sessionEmail}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ScheduleMeetingModal({
  projectId,
  projectName,
  members,
  sessionEmail,
  onClose,
}: {
  projectId: string;
  projectName: string;
  members: MemberOption[];
  sessionEmail: string;
  onClose: () => void;
}) {
  const router = useRouter();

  const defaults = useMemo(() => buildDefaults(), []);

  const [subject, setSubject] = useState(`Σύσκεψη: ${projectName}`);
  const [startLocal, setStartLocal] = useState(defaults.start);
  const [endLocal, setEndLocal] = useState(defaults.end);
  const [organizerUpn, setOrganizerUpn] = useState(sessionEmail);
  const [bodyHtml, setBodyHtml] = useState('');

  // Member checkboxes — all selected by default. Map keyed by email.
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    members.forEach((m) => {
      // Don't auto-pick the organizer themselves — they'll be the owner of the event.
      if (m.email.toLowerCase() !== sessionEmail.toLowerCase()) init[m.email] = true;
    });
    return init;
  });

  const [externalEmails, setExternalEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ joinUrl: string | null; meetingNoteId: string } | null>(
    null,
  );

  function toggle(email: string) {
    setPicked((s) => ({ ...s, [email]: !s[email] }));
  }

  async function submit() {
    setError(null);

    const start = parseLocalDate(startLocal);
    const end = parseLocalDate(endLocal);
    if (!start || !end) {
      setError('Μη έγκυρες ημερομηνίες.');
      return;
    }
    if (end <= start) {
      setError('Η λήξη πρέπει να είναι μετά την έναρξη.');
      return;
    }

    const memberEmails = Object.entries(picked)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const extras = externalEmails
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));

    if (memberEmails.length === 0 && extras.length === 0) {
      setError('Επίλεξε τουλάχιστον έναν συμμετέχοντα.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          organizerUpn: organizerUpn.trim() || undefined,
          memberEmails,
          externalEmails: extras,
          bodyHtml: bodyHtml.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Σφάλμα');
        return;
      }
      setSuccess({ joinUrl: data.joinUrl, meetingNoteId: data.meetingNoteId });
      router.refresh();
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
          <h3 className="text-base font-semibold">Νέα Teams Σύσκεψη</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
            ✕
          </button>
        </div>

        {success ? (
          <div className="space-y-3 p-5">
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              ✓ Η σύσκεψη δημιουργήθηκε. Τα invitations στάλθηκαν από Outlook.
            </div>
            {success.joinUrl && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Join URL</label>
                <input
                  type="text"
                  value={success.joinUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-xs font-mono"
                />
                <a
                  href={success.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white"
                >
                  Άνοιγμα Teams
                </a>
              </div>
            )}
            <p className="text-xs text-gray-500">
              Όταν η σύσκεψη τελειώσει, το transcript θα εμφανιστεί αυτόματα στη σελίδα{' '}
              <strong>Teams Συσκέψεις</strong> με προ-επιλεγμένο το project «{projectName}».
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="rounded bg-gray-100 px-4 py-1.5 text-sm font-medium"
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Θέμα</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={busy}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Έναρξη</label>
                  <input
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    disabled={busy}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Λήξη</label>
                  <input
                    type="datetime-local"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    disabled={busy}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Διοργανωτής (AAD UPN)
                </label>
                <input
                  type="email"
                  value={organizerUpn}
                  onChange={(e) => setOrganizerUpn(e.target.value)}
                  disabled={busy}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                {organizerUpn.toLowerCase() !== sessionEmail.toLowerCase() && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    Διαφορετικό από το session email — βεβαιώσου ότι έχεις delegated access.
                  </p>
                )}
              </div>

              {members.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Μέλη του project ({members.length})
                  </label>
                  <div className="max-h-44 overflow-y-auto rounded border border-gray-200 p-2">
                    {members.map((m) => (
                      <label
                        key={m.email}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={picked[m.email] ?? false}
                          onChange={() => toggle(m.email)}
                          disabled={busy}
                        />
                        <span className="font-medium">{m.name || m.email}</span>
                        {m.name && <span className="text-xs text-gray-500">{m.email}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Εξωτερικοί συμμετέχοντες (emails)
                </label>
                <textarea
                  rows={2}
                  value={externalEmails}
                  onChange={(e) => setExternalEmails(e.target.value)}
                  placeholder="external@client.gr, partner@vendor.com"
                  disabled={busy}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Σώμα invite (προαιρετικό HTML)
                </label>
                <textarea
                  rows={3}
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  placeholder="<p>Agenda…</p>"
                  disabled={busy}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                />
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
                onClick={submit}
                disabled={busy}
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:bg-gray-300"
              >
                {busy ? 'Δημιουργία…' : 'Δημιουργία σύσκεψης'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function buildDefaults(): { start: string; end: string } {
  const now = new Date();
  // Round up to the next hour
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function toLocalInput(d: Date): string {
  // datetime-local expects "YYYY-MM-DDTHH:MM"
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
