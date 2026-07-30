'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { notifyCustomerAttachment } from '@/lib/notifications/customer';

async function requireProjectEditor(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role === 'admin' || role === 'manager') return session.user.id;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error('Project not found');
  if (project.ownerId !== session.user.id) throw new Error('Forbidden');
  return session.user.id;
}

export async function addProjectMember(projectId: string, userId: string) {
  await requireProjectEditor(projectId);

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (existing) return { ok: false, error: 'Ο χρήστης είναι ήδη μέλος.' };

  await prisma.projectMember.create({
    data: { projectId, userId },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

export async function removeProjectMember(projectId: string, userId: string) {
  await requireProjectEditor(projectId);

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

export async function setProjectApprover(projectId: string, userId: string | null) {
  await requireProjectEditor(projectId);

  if (userId) {
    // Approver may be ANY workspace user — no membership requirement.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return { ok: false, error: 'Ο χρήστης δεν βρέθηκε.' };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { approverId: userId },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

/**
 * Ιδιότητα και αρμοδιότητες ενός μέλους ΣΕ ΑΥΤΟ το έργο, μαζί με τα τηλέφωνά του.
 *
 * Δύο ξεχωριστές γραφές επίτηδες, γιατί αγγίζουν διαφορετικά πράγματα:
 * το `title`/`responsibilities`/`visibleToCustomer` ζουν στη σχέση μέλους–έργου
 * (ο ίδιος άνθρωπος έχει άλλη ιδιότητα αλλού), ενώ τα τηλέφωνα ζουν στον χρήστη
 * και η αλλαγή τους φαίνεται σε ΚΑΘΕ έργο. Το UI το λέει ρητά στον χρήστη.
 */
export async function updateProjectMemberProfile(
  projectId: string,
  userId: string,
  input: {
    title: string | null;
    responsibilities: string | null;
    visibleToCustomer: boolean;
    phone: string | null;
    mobile: string | null;
  },
) {
  await requireProjectEditor(projectId);

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  if (!membership) return { ok: false as const, error: 'Ο χρήστης δεν είναι μέλος του έργου.' };

  const t = (v: string | null) => (v ?? '').trim().slice(0, 200) || null;

  await prisma.$transaction([
    prisma.projectMember.update({
      where: { id: membership.id },
      data: {
        title: t(input.title),
        responsibilities: (input.responsibilities ?? '').trim().slice(0, 2000) || null,
        visibleToCustomer: input.visibleToCustomer,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { phone: t(input.phone), mobile: t(input.mobile) },
    }),
  ]);

  revalidatePath(`/projects/${projectId}`);
  // Ο πελάτης βλέπει αυτά τα στοιχεία στο portal μόλις αλλάξουν.
  revalidatePath(`/portal/projects/${projectId}`);
  return { ok: true as const };
}

/**
 * Ορατότητα αρχείου έργου προς τον πελάτη.
 *
 * Default `internal`, οπότε χωρίς αυτή την ενέργεια κανένα αρχείο δεν φτάνει
 * ποτέ στο portal. Το ανεβασμένο από τον πελάτη δεν γίνεται εσωτερικό — θα
 * εξαφανιζόταν από αυτόν που το έστειλε.
 */
export async function setAttachmentVisibility(
  attachmentId: string,
  visibility: 'internal' | 'shared',
) {
  const att = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { projectId: true, uploadedBy: { select: { userType: true } } },
  });
  if (!att?.projectId) return { ok: false as const, error: 'Δεν βρέθηκε το αρχείο.' };

  await requireProjectEditor(att.projectId);

  if (att.uploadedBy.userType === 'customer' && visibility === 'internal') {
    return { ok: false as const, error: 'Τα αρχεία του πελάτη είναι πάντα ορατά σε αυτόν.' };
  }

  await prisma.attachment.update({ where: { id: attachmentId }, data: { visibility } });

  // Η στιγμή που ο πελάτης αποκτά πρόσβαση είναι ΕΔΩ, όχι στο ανέβασμα: τα
  // αρχεία γεννιούνται `internal`, οπότε ειδοποίηση στο upload route δεν θα
  // πυροδοτούσε ποτέ. Μόνο η μετάβαση προς `shared` είναι είδηση.
  if (visibility === 'shared') {
    await notifyCustomerAttachment(attachmentId);
  }

  revalidatePath(`/projects/${att.projectId}`);
  revalidatePath(`/portal/projects/${att.projectId}`);
  return { ok: true as const };
}
