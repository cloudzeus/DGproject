import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { TeamsMeetingsBrowser } from './teams-meetings-browser';

/**
 * /teams-meetings — global browse page.
 *
 * Server fetches the user's available projects + initial filter state. The
 * client component then fetches Graph data via /api/teams-meetings/list and
 * lets the user assign each meeting to a project.
 */
export default async function TeamsMeetingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  // Projects the user is a member of, or owns, or all if admin/manager.
  const isPriv =
    session.user.role === 'admin' || session.user.role === 'manager';

  const projects = await prisma.project.findMany({
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
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Teams Meetings</h1>
        <p className="text-sm text-gray-500">
          Όλες οι Microsoft Teams συσκέψεις σου με recording ή transcript. Ανάθεσε καθεμία
          σε ένα project για αυτόματη αποδελτίωση + δημιουργία tasks.
        </p>
      </header>

      <TeamsMeetingsBrowser
        organizerEmail={session.user.email}
        projects={projects}
      />
    </div>
  );
}
