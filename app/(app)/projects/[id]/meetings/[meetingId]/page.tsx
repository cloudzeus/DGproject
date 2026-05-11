import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { ActionItemsList } from './action-items-list';

type Decision = {
  text: string;
  timestampSec: number;
  participantEmails: string[];
};
type ActionItem = {
  title: string;
  description: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  confidence: number;
  sourceQuote: string;
  sourceTimestampSec: number;
};
type Risk = { text: string; severity: 'low' | 'medium' | 'high'; ownerEmail: string | null };
type OpenQuestion = { question: string; askedToEmail: string | null; askedByEmail: string | null };

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const { id: projectId, meetingId } = await params;
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const isPriv = session.user.role === 'admin' || session.user.role === 'manager';

  const [meeting, projects] = await Promise.all([
    prisma.meetingNote.findUnique({
      where: { id: meetingId },
      include: {
        organizer: { select: { name: true, email: true } },
        project: { select: { id: true, name: true } },
        generatedTasks: {
          orderBy: { createdAt: 'asc' },
          include: {
            assignees: { include: { user: { select: { name: true, email: true } } } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    }),
    // Projects the user can create tasks in. Privileged users see all; others
    // see only the projects they own or are members of.
    prisma.project.findMany({
      where: isPriv
        ? {}
        : {
            OR: [
              { ownerId: session.user.id ?? undefined },
              { members: { some: { user: { email: session.user.email } } } },
            ],
          },
      select: { id: true, name: true, status: true },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
  ]);
  if (!meeting || meeting.projectId !== projectId) notFound();

  const decisions = (meeting.decisions as Prisma.JsonValue as Decision[] | null) ?? [];
  const actionItems = (meeting.actionItems as Prisma.JsonValue as ActionItem[] | null) ?? [];
  const risks = (meeting.risks as Prisma.JsonValue as Risk[] | null) ?? [];
  const openQuestions = (meeting.openQuestions as Prisma.JsonValue as OpenQuestion[] | null) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <Link
          href={`/projects/${projectId}/meetings`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← {meeting.project.name} / Συσκέψεις
        </Link>
        <h1 className="text-2xl font-semibold">{meeting.subject}</h1>
        <p className="text-sm text-gray-500">
          {formatDate(meeting.startedAt)} — {formatTime(meeting.endedAt)} ·{' '}
          {Math.round(meeting.durationSec / 60)} λεπτά · Organizer:{' '}
          {meeting.organizer.name ?? meeting.organizer.email}
        </p>
        {meeting.status === 'failed' && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <strong>Failed:</strong> {meeting.errorMessage}
          </div>
        )}
      </header>

      {meeting.summary && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-base font-semibold">Περίληψη</h2>
          <p className="whitespace-pre-line text-sm text-gray-800">{meeting.summary}</p>
        </section>
      )}

      {decisions.length > 0 && (
        <Section title={`Αποφάσεις (${decisions.length})`}>
          <ul className="space-y-2">
            {decisions.map((d, i) => (
              <li key={i} className="rounded border border-gray-200 bg-white p-3 text-sm">
                <div>{d.text}</div>
                <div className="mt-1 text-xs text-gray-500">
                  στο {formatSec(d.timestampSec)} ·{' '}
                  {d.participantEmails.length} συμμετέχοντες
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {actionItems.length > 0 && (
        <Section title={`Action items (${actionItems.length}) · ${meeting.autoTasksCreated} έγιναν tasks · ${meeting.autoTasksNeedReview} need review`}>
          <p className="mb-2 text-xs text-gray-500">
            Κάθε action item έχει ήδη γίνει task στο πρωτεύον project ({meeting.project.name}).
            Αν η σύσκεψη κάλυπτε και άλλα projects, μπορείς να δημιουργήσεις επιπλέον tasks
            από την ίδια αναφορά σε διαφορετικό project.
          </p>
          <ActionItemsList
            meetingId={meeting.id}
            primaryProjectId={meeting.project.id}
            actionItems={actionItems}
            projects={projects}
          />
        </Section>
      )}

      {risks.length > 0 && (
        <Section title={`Ρίσκα (${risks.length})`}>
          <ul className="space-y-2">
            {risks.map((r, i) => (
              <li key={i} className="rounded border border-gray-200 bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span>{r.text}</span>
                  <SeverityBadge s={r.severity} />
                </div>
                {r.ownerEmail && (
                  <div className="mt-1 text-xs text-gray-500">owner: {r.ownerEmail}</div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {openQuestions.length > 0 && (
        <Section title={`Ανοιχτά ερωτήματα (${openQuestions.length})`}>
          <ul className="space-y-2">
            {openQuestions.map((q, i) => (
              <li key={i} className="rounded border border-gray-200 bg-white p-3 text-sm">
                <div>{q.question}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {q.askedByEmail && <>by {q.askedByEmail}</>}
                  {q.askedByEmail && q.askedToEmail && <> → </>}
                  {q.askedToEmail && <>{q.askedToEmail}</>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {meeting.generatedTasks.length > 0 && (
        <Section title={`Δημιουργήθηκαν tasks (${meeting.generatedTasks.length})`}>
          <ul className="space-y-2">
            {meeting.generatedTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded border border-gray-200 bg-white p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {t.status} · {t.priority}
                    {t.dueDate && ` · due ${formatDate(t.dueDate)}`}
                    {t.meetingNeedsReview && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                        needs review
                      </span>
                    )}
                    {t.project && (
                      <Link
                        href={`/projects/${t.project.id}`}
                        className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 hover:bg-blue-100"
                      >
                        → {t.project.name}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="ml-3 shrink-0 text-xs text-gray-500">
                  {t.assignees.length > 0
                    ? t.assignees.map((a) => a.user.name ?? a.user.email).join(', ')
                    : 'unassigned'}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
          LLM metadata + raw transcript
        </summary>
        <div className="space-y-3 border-t border-gray-200 p-5 text-xs">
          <div className="grid grid-cols-2 gap-2 text-gray-600 md:grid-cols-4">
            <div>
              <div className="font-semibold">Provider</div>
              <div>{meeting.llmProvider ?? '—'}</div>
            </div>
            <div>
              <div className="font-semibold">Model</div>
              <div>{meeting.llmModel ?? '—'}</div>
            </div>
            <div>
              <div className="font-semibold">Tokens</div>
              <div>
                {meeting.llmInputTokens ?? '—'} in / {meeting.llmOutputTokens ?? '—'} out
              </div>
            </div>
            <div>
              <div className="font-semibold">Latency</div>
              <div>{meeting.llmDurationMs ? `${meeting.llmDurationMs}ms` : '—'}</div>
            </div>
          </div>
          {meeting.transcriptVtt && (
            <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-3 font-mono text-[10px] leading-relaxed">
              {meeting.transcriptVtt}
            </pre>
          )}
        </div>
      </details>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SeverityBadge({ s }: { s: string }) {
  const styles: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-700',
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${styles[s] ?? styles.medium}`}>{s}</span>;
}

function formatDate(d: Date | string): string {
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' }).format(d);
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
