import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ProcessVttForm } from './process-vtt-form';

/**
 * /projects/[id]/meetings
 *
 * Server-component meeting list for a project. Top section shows recent
 * meetings; bottom shows a manual VTT processing form (POC fallback while
 * Graph permissions are being provisioned).
 */
export default async function ProjectMeetingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const meetings = await prisma.meetingNote.findMany({
    where: { projectId: id },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      subject: true,
      startedAt: true,
      endedAt: true,
      durationSec: true,
      summary: true,
      status: true,
      autoTasksCreated: true,
      autoTasksNeedReview: true,
      llmModel: true,
      llmInputTokens: true,
      llmOutputTokens: true,
      organizer: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-1">
        <Link href={`/projects/${project.id}`} className="text-sm text-blue-600 hover:underline">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-semibold">Συσκέψεις & Πρακτικά</h1>
        <p className="text-sm text-gray-500">
          Αποδελτιωμένα Microsoft Teams meetings — με αυτόματα tasks κατά confidence tier.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Πρόσφατες συσκέψεις</h2>
        {meetings.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            Καμία αποδελτιωμένη σύσκεψη ακόμα. Ξεκίνα με το upload παρακάτω.
          </p>
        ) : (
          <ul className="space-y-2">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/projects/${project.id}/meetings/${m.id}`}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-sm"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">{m.subject}</div>
                    <div className="text-xs text-gray-500">
                      {formatDate(m.startedAt)} · {Math.round(m.durationSec / 60)}′ ·
                      Organizer: {m.organizer.name ?? m.organizer.email}
                    </div>
                    {m.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-700">{m.summary}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    <StatusBadge status={m.status} />
                    {m.autoTasksCreated > 0 && (
                      <span className="rounded bg-green-50 px-2 py-0.5 text-green-700">
                        +{m.autoTasksCreated} task{m.autoTasksCreated > 1 ? 's' : ''}
                      </span>
                    )}
                    {m.autoTasksNeedReview > 0 && (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                        {m.autoTasksNeedReview} need review
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h2 className="mb-1 text-lg font-semibold">Νέα σύσκεψη από VTT</h2>
        <p className="mb-4 text-sm text-gray-500">
          Κάνε paste το WebVTT transcript (από Teams Recording / Stream / manual export).
          Το pipeline κάνει pseudonymize, καλεί το LLM, αποθηκεύει insights, και δημιουργεί
          tasks αυτόματα.
        </p>
        <ProcessVttForm projectId={project.id} />
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    processing: 'bg-blue-100 text-blue-700',
    ready: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
