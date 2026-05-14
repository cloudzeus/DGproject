'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN, deleteFileFromCDN } from '@/lib/bunnycdn';
import { sendEmail } from '@/lib/mailgun';
import { createNotifications } from '@/lib/notifications';
import {
  emailLayout,
  quote,
  attachmentsBlock,
  priorityPill,
  formatGreekDateTime,
  formatDuration,
  appUrl,
  avatarCircle,
  infoCard,
  statRow,
  sectionHeader,
  escapeHtml as escEmail,
  BRAND as EBRAND,
  type Attachment as EmailAttachmentInfo,
} from '@/lib/email-templates';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session.user;
}

async function loadProjectAccess(projectId: string, userId: string, role: string | undefined) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, color: true, ownerId: true },
  });
  if (!project) throw new Error('Project not found');
  if (role === 'admin' || role === 'manager' || project.ownerId === userId) return project;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new Error('Forbidden');
  return project;
}

type TaskMetaForEmail = {
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
};

function taskHeaderPills(meta?: TaskMetaForEmail): string {
  if (!meta) return '';
  const dueChip = meta.dueDate
    ? `<span style="display:inline-block;font-size:11px;color:#424242;background:#EEE;padding:3px 10px;border-radius:999px;margin-right:6px;margin-bottom:4px;">Λήξη ${formatGreekDateTime(meta.dueDate)}</span>`
    : '';
  return `${priorityPill(meta.priority)}${dueChip}`;
}

/**
 * "Sender" line: avatar circle + name + role line + secondary timestamp/email.
 * Used at the top of question/answer email bodies for an inbox-style cue.
 */
function senderLine({
  name,
  email,
  caption,
}: {
  name: string;
  email?: string | null;
  caption: string;
}): string {
  return `
    <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 12px;">
      <tr>
        <td style="width:44px;padding-right:10px;vertical-align:middle;">${avatarCircle(name, { size: 36 })}</td>
        <td style="vertical-align:middle;">
          <div style="font-size:13px;color:${EBRAND.text};font-weight:600;line-height:1.2;">${escEmail(name)}</div>
          <div style="font-size:11px;color:${EBRAND.textDim};line-height:1.2;margin-top:2px;">
            ${escEmail(caption)}${email ? ` · ${escEmail(email)}` : ''}
          </div>
        </td>
      </tr>
    </table>`;
}

async function notifyQuestionCreated(params: {
  questionId: string;
  taskId: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  askedBy: { id: string; name: string | null; email: string };
  askedTo: { id: string; name: string | null; email: string };
  taskTitle: string;
  taskMeta?: TaskMetaForEmail;
  body: string;
  createdAt: Date;
  attachments?: EmailAttachmentInfo[];
}) {
  const { taskId, projectName, projectColor, askedBy, askedTo, taskTitle, taskMeta, body, createdAt, attachments } = params;
  const askerName = askedBy.name ?? askedBy.email;
  const recipientName = askedTo.name ?? askedTo.email;

  await createNotifications([
    {
      userId: askedTo.id,
      title: 'Νέα ερώτηση σε εργασία',
      message: `Ο/Η ${askerName} σου έθεσε ερώτηση στην εργασία "${taskTitle}" του έργου ${projectName}.`,
      type: 'question',
      link: '/questions',
    },
  ]);

  if (!askedTo.email) return;

  const bodyHtml = `
    ${senderLine({
      name: askerName,
      email: askedBy.email,
      caption: `έθεσε ερώτηση · ${formatGreekDateTime(createdAt)}`,
    })}
    ${quote({ body, tone: 'info' })}
    ${attachmentsBlock(attachments ?? [])}
    ${infoCard(
      `<div style="font-size:12px;color:${EBRAND.textSoft};line-height:1.55;">
        Απάντησε απευθείας από την πλατφόρμα για να μείνει η συζήτηση σε ένα μέρος.
        Θα ειδοποιηθεί ο/η <strong style="color:${EBRAND.text};">${escEmail(askerName)}</strong>
        όταν στείλεις την απάντησή σου.
      </div>`,
      { tone: 'info' },
    )}
  `;

  const html = emailLayout({
    recipientName,
    header: {
      kicker: { text: '❓ Νέα ερώτηση', tone: 'info' },
      eyebrow: { text: projectName, color: projectColor },
      title: taskTitle,
      pillsHtml: taskHeaderPills(taskMeta),
    },
    body: bodyHtml,
    actions: [
      { label: 'Απάντηση στις ερωτήσεις', url: appUrl('/questions'), variant: 'primary' },
      { label: 'Άνοιγμα εργασίας', url: appUrl(`/projects/${params.projectId}?task=${taskId}`), variant: 'secondary' },
    ],
    footerNote: 'Όλες οι ερωτήσεις και απαντήσεις διατηρούνται στο νήμα της εργασίας.',
  });

  try {
    await sendEmail({
      to: askedTo.email,
      subject: `[${projectName}] Ερώτηση: ${taskTitle}`,
      html,
    });
  } catch (e) {
    console.warn('[question email] failed', e);
  }
}

async function notifyAnswerCreated(params: {
  taskId: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  asker: { id: string; name: string | null; email: string };
  answeredBy: { id: string; name: string | null; email: string };
  taskTitle: string;
  taskMeta?: TaskMetaForEmail;
  question: string;
  questionAttachments: EmailAttachmentInfo[];
  questionCreatedAt: Date;
  answer: string;
  answerAttachments: EmailAttachmentInfo[];
  answeredAt: Date;
}) {
  const {
    taskId,
    projectName,
    projectColor,
    asker,
    answeredBy,
    taskTitle,
    taskMeta,
    question,
    questionAttachments,
    questionCreatedAt,
    answer,
    answerAttachments,
    answeredAt,
  } = params;
  const responderName = answeredBy.name ?? answeredBy.email;
  const askerName = asker.name ?? asker.email;
  const responseMs = answeredAt.getTime() - questionCreatedAt.getTime();
  const responseDuration = responseMs > 0 ? formatDuration(responseMs) : null;

  await createNotifications([
    {
      userId: asker.id,
      title: 'Απάντηση σε ερώτησή σου',
      message: `Ο/Η ${responderName} απάντησε στην ερώτησή σου για την εργασία "${taskTitle}" στο έργο ${projectName}.`,
      type: 'answer',
      link: '/questions',
    },
  ]);

  if (!asker.email) return;

  // Stats tiles up top: total response time + the date answered. Mirrors the
  // report-style "at-a-glance" header.
  const responseTiles = responseDuration
    ? statRow([
        { label: 'Χρόνος απόκρισης', value: responseDuration, tone: 'success' },
        { label: 'Απαντήθηκε', value: formatGreekDateTime(answeredAt), tone: 'default' },
      ])
    : statRow([{ label: 'Απαντήθηκε', value: formatGreekDateTime(answeredAt), tone: 'success' }]);

  const bodyHtml = `
    ${responseTiles}
    ${sectionHeader({ label: 'Η ερώτησή σου', color: EBRAND.textSoft })}
    ${senderLine({
      name: askerName,
      email: asker.email,
      caption: `Στάλθηκε · ${formatGreekDateTime(questionCreatedAt)}`,
    })}
    ${quote({ body: question, tone: 'neutral' })}
    ${attachmentsBlock(questionAttachments)}

    ${sectionHeader({ label: 'Η απάντηση', color: EBRAND.success })}
    ${senderLine({
      name: responderName,
      email: answeredBy.email,
      caption: `Απάντησε · ${formatGreekDateTime(answeredAt)}`,
    })}
    ${quote({ body: answer, tone: 'success' })}
    ${attachmentsBlock(answerAttachments)}
  `;

  const html = emailLayout({
    recipientName: askerName,
    header: {
      kicker: { text: '✓ Νέα απάντηση', tone: 'success' },
      eyebrow: { text: projectName, color: projectColor },
      title: taskTitle,
      pillsHtml: taskHeaderPills(taskMeta),
    },
    body: bodyHtml,
    actions: [
      { label: 'Όλες οι ερωτήσεις', url: appUrl('/questions'), variant: 'primary' },
      { label: 'Άνοιγμα εργασίας', url: appUrl(`/projects/${params.projectId}?task=${taskId}`), variant: 'secondary' },
    ],
    footerNote: 'Όλες οι ερωτήσεις και απαντήσεις διατηρούνται στο νήμα της εργασίας.',
  });

  try {
    await sendEmail({
      to: asker.email,
      cc: answeredBy.email && answeredBy.email !== asker.email ? [answeredBy.email] : undefined,
      subject: `[${projectName}] Απάντηση: ${taskTitle}`,
      html,
    });
  } catch (e) {
    console.warn('[answer email] failed', e);
  }
}

export async function askTaskQuestion(
  projectId: string,
  taskId: string,
  formData: FormData,
) {
  const user = await requireSession();
  const project = await loadProjectAccess(projectId, user.id, user.role);

  const askedToId = String(formData.get('askedToId') ?? '').trim();
  const question = String(formData.get('question') ?? '').trim();
  const parentIdRaw = String(formData.get('parentId') ?? '').trim();
  const parentId = parentIdRaw.length > 0 ? parentIdRaw : null;

  if (!askedToId) return { ok: false as const, error: 'Επίλεξε παραλήπτη.' };
  if (question.length < 2) return { ok: false as const, error: 'Η ερώτηση είναι πολύ σύντομη.' };
  if (question.length > 4000) return { ok: false as const, error: 'Η ερώτηση είναι πολύ μεγάλη.' };
  if (askedToId === user.id) return { ok: false as const, error: 'Δεν μπορείς να ρωτήσεις τον εαυτό σου.' };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true, priority: true, startDate: true, dueDate: true },
  });
  if (!task || task.projectId !== projectId) return { ok: false as const, error: 'Η εργασία δεν βρέθηκε.' };

  // Follow-up question: validate parent belongs to same task
  if (parentId) {
    const parent = await prisma.taskQuestion.findUnique({
      where: { id: parentId },
      select: { id: true, taskId: true },
    });
    if (!parent || parent.taskId !== taskId) {
      return { ok: false as const, error: 'Η γονική ερώτηση δεν βρέθηκε.' };
    }
  }

  const recipient = await prisma.user.findUnique({
    where: { id: askedToId },
    select: { id: true, name: true, email: true },
  });
  if (!recipient) return { ok: false as const, error: 'Ο χρήστης δεν βρέθηκε.' };

  const isProjectMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: askedToId } },
  });
  const isOwner = project.ownerId === askedToId;
  if (!isProjectMember && !isOwner) {
    return { ok: false as const, error: 'Ο χρήστης δεν συμμετέχει στο έργο.' };
  }

  const created = await prisma.taskQuestion.create({
    data: {
      taskId,
      askedById: user.id,
      askedToId,
      parentId,
      question,
    },
    select: { id: true, createdAt: true },
  });

  const asker = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true },
  });

  await notifyQuestionCreated({
    questionId: created.id,
    taskId,
    projectId,
    projectName: project.name,
    projectColor: project.color,
    askedBy: asker ?? { id: user.id, name: null, email: user.email ?? '' },
    askedTo: recipient,
    taskTitle: task.title,
    taskMeta: { priority: task.priority, startDate: task.startDate, dueDate: task.dueDate },
    body: question,
    createdAt: created.createdAt,
    attachments: [],
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/questions');
  return { ok: true as const, id: created.id };
}

export async function answerTaskQuestion(
  projectId: string,
  questionId: string,
  formData: FormData,
) {
  const user = await requireSession();
  await loadProjectAccess(projectId, user.id, user.role);

  const answer = String(formData.get('answer') ?? '').trim();
  if (answer.length < 1) return { ok: false as const, error: 'Η απάντηση δεν μπορεί να είναι κενή.' };
  if (answer.length > 4000) return { ok: false as const, error: 'Η απάντηση είναι πολύ μεγάλη.' };

  const existing = await prisma.taskQuestion.findUnique({
    where: { id: questionId },
    include: {
      task: {
        select: {
          id: true,
          projectId: true,
          title: true,
          priority: true,
          startDate: true,
          dueDate: true,
          project: { select: { name: true, color: true } },
        },
      },
      askedBy: { select: { id: true, name: true, email: true } },
      askedTo: { select: { id: true, name: true, email: true } },
      attachments: { select: { kind: true, name: true, title: true, url: true } },
    },
  });
  if (!existing) return { ok: false as const, error: 'Η ερώτηση δεν βρέθηκε.' };
  if (existing.task.projectId !== projectId) return { ok: false as const, error: 'Forbidden.' };

  const isAskee = existing.askedToId === user.id;
  const isPrivileged = user.role === 'admin' || user.role === 'manager';
  if (!isAskee && !isPrivileged) {
    return { ok: false as const, error: 'Μόνο ο παραλήπτης μπορεί να απαντήσει.' };
  }

  const updated = await prisma.taskQuestion.update({
    where: { id: questionId },
    data: {
      answer,
      answeredAt: new Date(),
    },
    select: { answeredAt: true },
  });

  const questionAttachments = existing.attachments
    .filter((a) => a.kind === 'question')
    .map((a) => ({ name: a.name, title: a.title, url: a.url }));
  const answerAttachments = existing.attachments
    .filter((a) => a.kind === 'answer')
    .map((a) => ({ name: a.name, title: a.title, url: a.url }));

  await notifyAnswerCreated({
    taskId: existing.task.id,
    projectId,
    projectName: existing.task.project.name,
    projectColor: existing.task.project.color,
    asker: existing.askedBy,
    answeredBy: { id: user.id, name: user.name ?? null, email: user.email ?? '' },
    taskTitle: existing.task.title,
    taskMeta: {
      priority: existing.task.priority,
      startDate: existing.task.startDate,
      dueDate: existing.task.dueDate,
    },
    question: existing.question,
    questionAttachments,
    questionCreatedAt: existing.createdAt,
    answer,
    answerAttachments,
    answeredAt: updated.answeredAt ?? new Date(),
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/board');
  revalidatePath('/questions');
  return { ok: true as const };
}

export async function deleteTaskQuestion(projectId: string, questionId: string) {
  const user = await requireSession();
  await loadProjectAccess(projectId, user.id, user.role);

  const q = await prisma.taskQuestion.findUnique({
    where: { id: questionId },
    select: {
      askedById: true,
      task: { select: { projectId: true } },
      attachments: { select: { id: true, url: true } },
    },
  });
  if (!q) return { ok: false as const, error: 'Δεν βρέθηκε.' };
  if (q.task.projectId !== projectId) return { ok: false as const, error: 'Forbidden.' };

  const isAuthor = q.askedById === user.id;
  const isPrivileged = user.role === 'admin' || user.role === 'manager';
  if (!isAuthor && !isPrivileged) return { ok: false as const, error: 'Δεν επιτρέπεται.' };

  for (const att of q.attachments) {
    try {
      const url = new URL(att.url);
      const storagePath = url.pathname.replace(/^\/+/, '');
      if (storagePath) await deleteFileFromCDN(storagePath);
    } catch {
      // best-effort
    }
  }

  await prisma.taskQuestion.delete({ where: { id: questionId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/questions');
  return { ok: true as const };
}

export async function uploadQuestionAttachment(
  projectId: string,
  questionId: string,
  kind: 'question' | 'answer',
  formData: FormData,
) {
  const user = await requireSession();
  await loadProjectAccess(projectId, user.id, user.role);

  const file = formData.get('file');
  const title = String(formData.get('title') ?? '').trim() || null;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: 'Δεν επιλέχθηκε αρχείο.' };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false as const, error: 'Το αρχείο υπερβαίνει τα 25MB.' };
  }

  const q = await prisma.taskQuestion.findUnique({
    where: { id: questionId },
    select: {
      askedById: true,
      askedToId: true,
      answer: true,
      task: { select: { projectId: true } },
    },
  });
  if (!q) return { ok: false as const, error: 'Δεν βρέθηκε.' };
  if (q.task.projectId !== projectId) return { ok: false as const, error: 'Forbidden.' };

  const isPrivileged = user.role === 'admin' || user.role === 'manager';
  if (kind === 'question' && q.askedById !== user.id && !isPrivileged) {
    return { ok: false as const, error: 'Μόνο ο συντάκτης μπορεί να επισυνάψει.' };
  }
  if (kind === 'answer' && q.askedToId !== user.id && !isPrivileged) {
    return { ok: false as const, error: 'Μόνο ο παραλήπτης μπορεί να επισυνάψει στην απάντηση.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const storedName = `${Date.now()}-${safeName}`;

  try {
    const uploaded = await uploadFileToCDN({
      file: buffer,
      filename: storedName,
      folder: `questions/${questionId}/${kind}`,
      contentType: file.type || 'application/octet-stream',
    });

    await prisma.taskQuestionAttachment.create({
      data: {
        questionId,
        uploadedById: user.id,
        kind,
        name: file.name,
        title,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: uploaded.url,
      },
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/questions');
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: 'Αποτυχία μεταφόρτωσης.' };
  }
}

export async function deleteQuestionAttachment(projectId: string, attachmentId: string) {
  const user = await requireSession();
  await loadProjectAccess(projectId, user.id, user.role);

  const att = await prisma.taskQuestionAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      url: true,
      uploadedById: true,
      question: { select: { task: { select: { projectId: true } } } },
    },
  });
  if (!att) return { ok: false as const, error: 'Δεν βρέθηκε.' };
  if (att.question.task.projectId !== projectId) return { ok: false as const, error: 'Forbidden.' };

  const isUploader = att.uploadedById === user.id;
  const isPrivileged = user.role === 'admin' || user.role === 'manager';
  if (!isUploader && !isPrivileged) return { ok: false as const, error: 'Δεν επιτρέπεται.' };

  try {
    const url = new URL(att.url);
    const storagePath = url.pathname.replace(/^\/+/, '');
    if (storagePath) await deleteFileFromCDN(storagePath);
  } catch {
    // best-effort
  }

  await prisma.taskQuestionAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/questions');
  return { ok: true as const };
}
