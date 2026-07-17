'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { sendMail, sendMailWithAttachments, type MailAttachment } from '@/lib/graph-mail';
import { buildHiddenTagFooter } from '@/lib/email-tag';

export type SendProjectEmailAttachment = {
  name: string;
  contentType: string;
  dataBase64: string;
};

export type SendProjectEmailInput = {
  projectId: string;
  taskId?: string | null;
  questionId?: string | null;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  attachments?: SendProjectEmailAttachment[];
};

// Όρια συνημμένων — ευθυγραμμισμένα με το direct attachment POST του Graph
// (~3MB/αρχείο)· μεγαλύτερα αρχεία θέλουν upload sessions (μελλοντική επέκταση).
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function base64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

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

  // Validation συνημμένων πριν από οποιαδήποτε κλήση Graph.
  const attachments: MailAttachment[] = [];
  if (input.attachments && input.attachments.length > 0) {
    if (input.attachments.length > MAX_ATTACHMENTS) {
      return { ok: false, error: `Έως ${MAX_ATTACHMENTS} συνημμένα ανά email.` };
    }
    let total = 0;
    for (const a of input.attachments) {
      const name = a.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200).trim();
      if (!name) return { ok: false, error: 'Μη έγκυρο όνομα συνημμένου.' };
      const bytes = base64Bytes(a.dataBase64);
      if (bytes === 0) return { ok: false, error: `Το «${name}» είναι κενό.` };
      if (bytes > MAX_ATTACHMENT_BYTES) {
        return { ok: false, error: `Το «${name}» ξεπερνά τα 3MB ανά αρχείο.` };
      }
      total += bytes;
      if (total > MAX_TOTAL_BYTES) {
        return { ok: false, error: 'Τα συνημμένα ξεπερνούν συνολικά τα 20MB.' };
      }
      attachments.push({
        name,
        contentType: a.contentType || 'application/octet-stream',
        contentBase64: a.dataBase64,
      });
    }
  }

  const bodyWithTag = `${input.bodyHtml}\n${buildHiddenTagFooter(project.projectCode, input.taskId ?? null)}`;

  try {
    if (attachments.length > 0) {
      await sendMailWithAttachments(session.user.id, { subject, bodyHtml: bodyWithTag, to, cc }, attachments);
    } else {
      await sendMail(session.user.id, { subject, bodyHtml: bodyWithTag, to, cc });
    }
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
      appliedNote:
        attachments.length > 0
          ? `συνημμένα (${attachments.length}): ${attachments.map((a) => a.name).join(', ').slice(0, 400)}`
          : null,
    },
  });

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true };
}
