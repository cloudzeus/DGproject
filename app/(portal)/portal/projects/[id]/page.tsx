import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getPortalScope } from '@/lib/portal/scope';
import { commentVisibilityFilter } from '@/lib/comments/visibility';
import { taskVisibilityFilter } from '@/lib/tasks/visibility';
import { listSharedMeetings } from '@/lib/portal/meetings';
import { listSharedFiles } from '@/lib/portal/files';
import { PortalProjectTabs } from './portal-project-tabs';

export const dynamic = 'force-dynamic';

const PROJECT_STATUS_LABEL: Record<string, string> = {
  planning: 'Σχεδιασμός',
  active: 'Ενεργό',
  on_hold: 'Σε αναμονή',
  completed: 'Ολοκληρωμένο',
  archived: 'Αρχειοθετημένο',
};

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const scope = await getPortalScope(session!.user.id);
  if (!scope) return null;

  // Το scope είναι ο μόνος έλεγχος πρόσβασης. Έργο εκτός scope → 404, χωρίς να
  // αποκαλύπτεται ότι υπάρχει έργο που δεν ανήκει στον πελάτη.
  if (!scope.projectIds.includes(id)) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      status: true,
      projectCode: true,
      startDate: true,
      dueDate: true,
      ownerId: true,
      // Μόνο τα μέλη που η ομάδα έχει σημειώσει ως ορατά στον πελάτη.
      members: {
        where: { visibleToCustomer: true },
        orderBy: { createdAt: 'asc' },
        select: {
          title: true,
          responsibilities: true,
          user: {
            select: { id: true, name: true, email: true, image: true, phone: true, mobile: true },
          },
        },
      },
      tasks: {
        // Οι εσωτερικές εργασίες δεν φεύγουν ποτέ από τον server — ούτε στη
        // λίστα, ούτε στα ποσοστά που υπολογίζονται παρακάτω.
        where: taskVisibilityFilter('customer'),
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueDate: true,
          completedAt: true,
          assignees: {
            select: { user: { select: { name: true, email: true, image: true } } },
          },
          // Ο κανόνας έρχεται από το lib/comments/visibility.ts — μία μόνο
          // υλοποίηση, ώστε staff και portal να μη μπορούν να διαφωνήσουν.
          comments: {
            where: commentVisibilityFilter('customer'),
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              content: true,
              createdAt: true,
              author: { select: { name: true, email: true, image: true, userType: true } },
            },
          },
          // ΜΟΝΟ ερωτήσεις που απευθύνονται σε χρήστη αυτής της εταιρίας.
          questions: {
            where: { askedToId: { in: scope.userIds } },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              question: true,
              answer: true,
              createdAt: true,
              askedBy: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!project) notFound();

  // Χωριστό query αντί για nested include: τα πρακτικά έχουν δική τους πύλη
  // ορατότητας (`momVisibility`) που ζει στο lib/portal/meetings.ts. Ένα
  // `include` εδώ θα σήμαινε δεύτερο αντίγραφο του φίλτρου μέσα σε αυτή τη
  // σελίδα — ακριβώς αυτό που το scope module υπάρχει για να αποτρέψει.
  const [meetings, files] = await Promise.all([
    listSharedMeetings(scope, { projectId: id }),
    // Τα αρχεία περνούν από το κοινό `listSharedFiles` αντί για nested include:
    // εκείνο ελέγχει ΚΑΙ την ορατότητα της εργασίας στην οποία κρέμεται το
    // αρχείο. Το nested include εδώ έλεγχε μόνο το ίδιο το αρχείο, οπότε ένα
    // `shared` αρχείο πάνω σε `internal` εργασία εμφανιζόταν στον πελάτη.
    listSharedFiles(scope, { projectId: id }),
  ]);

  return (
    <PortalProjectTabs
      meetings={meetings}
      projectName={project.name}
      projectCode={project.projectCode}
      statusLabel={PROJECT_STATUS_LABEL[project.status] ?? project.status}
      color={project.color}
      dueDate={project.dueDate?.toISOString() ?? null}
      team={project.members.map((m) => ({
        id: m.user.id,
        name: m.user.name ?? m.user.email,
        email: m.user.email,
        avatarUrl: m.user.image ?? undefined,
        title: m.title,
        responsibilities: m.responsibilities,
        phone: m.user.phone,
        mobile: m.user.mobile,
        isOwner: m.user.id === project.ownerId,
      }))}
      files={files}
      tasks={project.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.dueDate?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        assignees: t.assignees.map((a) => ({
          name: a.user.name ?? a.user.email,
          avatarUrl: a.user.image ?? undefined,
        })),
        comments: t.comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          authorName: c.author.name ?? c.author.email,
          authorAvatarUrl: c.author.image ?? undefined,
          fromUs: c.author.userType === 'customer',
        })),
        questions: t.questions.map((q) => ({
          id: q.id,
          question: q.question,
          answer: q.answer,
          createdAt: q.createdAt.toISOString(),
          askedByName: q.askedBy.name ?? q.askedBy.email,
        })),
      }))}
    />
  );
}
