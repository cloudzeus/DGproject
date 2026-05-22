'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { sendMail } from '@/lib/graph-mail';
import { buildHiddenTagFooter } from '@/lib/email-tag';

export type SendProjectEmailInput = {
  projectId: string;
  taskId?: string | null;
  questionId?: string | null;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
};

// Sends an email from the current user's Microsoft mailbox on behalf of a
// project (and optionally a specific task or question thread), then persists
// an EmailMessage row so the project history shows the outbound message. The
// hidden routing tag is appended to the body so replies route themselves back.
//
// Gated to non-customer users with a connected mailbox — customers and
// credential-only users hit the validation guards.
export async function sendProjectEmail(input: SendProjectEmailInput): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Δεν είσαι συνδεδεμένος.' };
  if (session.user.userType === 'customer') {
    return { ok: false, error: 'Δεν επιτρέπεται η αποστολή email από πελάτες.' };
  }

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      projectCode: true,
      ownerId: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) return { ok: false, error: 'Το έργο δεν υπάρχει.' };
  if (!project.projectCode) {
    return { ok: false, error: 'Το έργο δεν έχει project code.' };
  }

  // Authorization: only project owner, members, or admin/manager can send.
  const role = session.user.role;
  const isPrivileged = role === 'admin' || role === 'manager';
  const isOwner = project.ownerId === session.user.id;
  const isMember = project.members.some((m) => m.userId === session.user.id);
  if (!isPrivileged && !isOwner && !isMember) {
    return { ok: false, error: 'Δεν έχεις πρόσβαση σε αυτό το έργο.' };
  }

  const conn = await prisma.userMailConnection.findUnique({ where: { userId: session.user.id } });
  if (!conn) {
    return {
      ok: false,
      error: 'Δεν έχει συνδεθεί mailbox. Σύνδεσε το από το /profile.',
    };
  }

  // Validate recipients server-side — clients can be coerced.
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const to = input.to.filter((e) => emailRe.test(e));
  const cc = input.cc.filter((e) => emailRe.test(e));
  if (to.length === 0) return { ok: false, error: 'Χρειάζεται τουλάχιστον ένας έγκυρος παραλήπτης.' };

  const subject = input.subject.trim();
  if (subject.length === 0) return { ok: false, error: 'Το θέμα είναι κενό.' };

  const bodyWithTag = `${input.bodyHtml}\n${buildHiddenTagFooter(project.projectCode, input.taskId ?? null)}`;

  try {
    await sendMail(session.user.id, { subject, bodyHtml: bodyWithTag, to, cc });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Αποτυχία αποστολής.';
    // Persist a failed-send row so the user can see the attempt in the history.
    await prisma.emailMessage.create({
      data: {
        direction: 'outbound',
        status: 'failed',
        projectId: project.id,
        taskId: input.taskId ?? null,
        userId: session.user.id,
        subject,
        fromAddress: session.user.email,
        toAddresses: to.join(', '),
        ccAddresses: cc.length > 0 ? cc.join(', ') : null,
        bodyHtml: bodyWithTag,
        bodyPreview: input.bodyHtml.replace(/<[^>]+>/g, '').slice(0, 280),
        sentAt: new Date(),
        appliedNote: `send_failed: ${message.slice(0, 240)}`,
      },
    });
    return { ok: false, error: message };
  }

  await prisma.emailMessage.create({
    data: {
      direction: 'outbound',
      status: 'sent',
      projectId: project.id,
      taskId: input.taskId ?? null,
      userId: session.user.id,
      subject,
      fromAddress: session.user.email,
      toAddresses: to.join(', '),
      ccAddresses: cc.length > 0 ? cc.join(', ') : null,
      bodyHtml: bodyWithTag,
      bodyPreview: input.bodyHtml.replace(/<[^>]+>/g, '').slice(0, 280),
      sentAt: new Date(),
    },
  });

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true };
}
