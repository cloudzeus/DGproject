'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN, deleteFileFromCDN } from '@/lib/bunnycdn';
import { sendEmail } from '@/lib/mailgun';
import { createNotifications } from '@/lib/notifications';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

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

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Επείγουσα',
  high: 'Υψηλή',
  medium: 'Μεσαία',
  low: 'Χαμηλή',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#C50F1F',
  high: '#D83B01',
  medium: '#0078D4',
  low: '#8A8A8A',
};

function formatGreekDateTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('el-GR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return 'λιγότερο από ένα λεπτό';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} λεπτό${min === 1 ? '' : 'ά'}`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} ώρ${hr === 1 ? 'α' : 'ες'}`;
  const days = Math.round(hr / 24);
  return `${days} ημέρ${days === 1 ? 'α' : 'ες'}`;
}

type EmailAttachment = { name: string; title: string | null; url: string };

function attachmentsBlockHtml(attachments: EmailAttachment[]): string {
  if (attachments.length === 0) return '';
  const items = attachments
    .map((a) => {
      const label = a.title || a.name;
      return `
        <li style="margin-bottom:6px;">
          <a href="${escapeHtml(a.url)}" style="color:#0078D4;text-decoration:none;font-size:13px;">
            📎 ${escapeHtml(label)}
          </a>
          ${a.title ? `<span style="color:#9E9E9E;font-size:11px;margin-left:6px;">(${escapeHtml(a.name)})</span>` : ''}
        </li>`;
    })
    .join('');
  return `
    <div style="margin-top:12px;padding:12px;background:#FAFAFA;border:1px solid #EEE;border-radius:6px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#616161;margin-bottom:6px;">
        Συνημμένα (${attachments.length})
      </div>
      <ul style="list-style:none;padding:0;margin:0;">${items}</ul>
    </div>
  `;
}

function emailHeaderHtml(params: {
  projectName: string;
  projectColor: string;
  taskTitle: string;
  taskMeta?: TaskMetaForEmail;
}): string {
  const { projectName, projectColor, taskTitle, taskMeta } = params;
  const priorityKey = taskMeta?.priority ?? '';
  const priorityLabel = PRIORITY_LABEL[priorityKey] ?? priorityKey;
  const priorityColor = PRIORITY_COLOR[priorityKey] ?? '#8A8A8A';

  const metaPills = taskMeta
    ? `
      <div style="margin-top:8px;display:block;">
        ${
          priorityLabel
            ? `<span style="display:inline-block;font-size:11px;font-weight:600;color:white;background:${priorityColor};padding:3px 10px;border-radius:999px;margin-right:6px;">${escapeHtml(priorityLabel)}</span>`
            : ''
        }
        ${
          taskMeta.dueDate
            ? `<span style="display:inline-block;font-size:11px;color:#424242;background:#EEE;padding:3px 10px;border-radius:999px;margin-right:6px;">Λήξη ${escapeHtml(formatGreekDateTime(taskMeta.dueDate))}</span>`
            : ''
        }
      </div>
    `
    : '';

  return `
    <div style="border-left:4px solid ${projectColor};padding-left:16px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#616161;">${escapeHtml(projectName)}</div>
      <h1 style="margin:4px 0 0;font-size:20px;font-weight:600;color:#242424;line-height:1.3;">${escapeHtml(taskTitle)}</h1>
      ${metaPills}
    </div>
  `;
}

function emailFooterHtml(): string {
  return `
    <hr style="border:none;border-top:1px solid #EEE;margin:24px 0 16px;" />
    <p style="font-size:11px;color:#9E9E9E;margin:0;">
      Αυτό το email στάλθηκε από το A-Sisyphus σχετικά με μια ερώτηση σε εργασία.
      Απάντησε απευθείας από την πλατφόρμα για καλύτερη εμπειρία.
    </p>
  `;
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
  attachments?: EmailAttachment[];
}) {
  const { taskId, projectName, projectColor, askedBy, askedTo, taskTitle, taskMeta, body, createdAt, attachments } = params;
  const askerName = askedBy.name ?? askedBy.email;
  const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/projects/${params.projectId}?task=${taskId}` : '';
  const questionsLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/questions` : '';

  await createNotifications([
    {
      userId: askedTo.id,
      title: 'Νέα ερώτηση σε εργασία',
      message: `Ο/Η ${askerName} σου έθεσε ερώτηση στην εργασία "${taskTitle}" του έργου ${projectName}.`,
      type: 'question',
      link: '/questions',
    },
  ]);

  if (askedTo.email) {
    const html = `
      <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f1f1f;background:#FFF;">
        <div style="display:inline-block;font-size:11px;font-weight:700;color:#0078D4;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">
          ❓ Νέα ερώτηση
        </div>
        ${emailHeaderHtml({ projectName, projectColor, taskTitle, taskMeta })}

        <p style="font-size:14px;line-height:1.5;color:#424242;margin:0 0 4px;">
          Ο/Η <strong>${escapeHtml(askerName)}</strong> σου έθεσε μια ερώτηση
        </p>
        <p style="font-size:11px;color:#9E9E9E;margin:0 0 12px;">
          ${escapeHtml(formatGreekDateTime(createdAt))}
        </p>

        <blockquote style="margin:0;padding:16px 18px;background:#E8F4FD;border-left:4px solid #0078D4;border-radius:8px;font-size:14px;color:#242424;line-height:1.55;white-space:pre-wrap;word-break:break-word;">${escapeHtml(body)}</blockquote>

        ${attachmentsBlockHtml(attachments ?? [])}

        <div style="margin-top:24px;display:block;">
          ${
            questionsLink
              ? `<a href="${questionsLink}" style="display:inline-block;background:#0078D4;color:white;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:600;margin-right:8px;">Απάντηση στις ερωτήσεις</a>`
              : ''
          }
          ${
            taskLink
              ? `<a href="${taskLink}" style="display:inline-block;background:white;color:#0078D4;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;border:1px solid #0078D4;">Άνοιγμα εργασίας</a>`
              : ''
          }
        </div>

        ${emailFooterHtml()}
      </div>
    `;
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
  questionAttachments: EmailAttachment[];
  questionCreatedAt: Date;
  answer: string;
  answerAttachments: EmailAttachment[];
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
  const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/projects/${params.projectId}?task=${taskId}` : '';
  const questionsLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/questions` : '';
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

  if (asker.email) {
    const html = `
      <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f1f1f;background:#FFF;">
        <div style="display:inline-block;font-size:11px;font-weight:700;color:#107C41;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">
          ✓ Νέα απάντηση
        </div>
        ${emailHeaderHtml({ projectName, projectColor, taskTitle, taskMeta })}

        <p style="font-size:13px;color:#616161;margin:0 0 4px;">
          Η ερώτησή σου προς τον/την <strong>${escapeHtml(responderName)}</strong>
        </p>
        <p style="font-size:11px;color:#9E9E9E;margin:0 0 8px;">
          Στάλθηκε στις ${escapeHtml(formatGreekDateTime(questionCreatedAt))}
        </p>
        <blockquote style="margin:0 0 4px;padding:12px 16px;background:#FAFAFA;border-left:3px solid #C7C7C7;border-radius:6px;font-size:13px;color:#424242;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${escapeHtml(question)}</blockquote>
        ${attachmentsBlockHtml(questionAttachments)}

        <div style="margin:24px 0 8px;">
          <p style="font-size:14px;color:#424242;margin:0 0 4px;">
            Ο/Η <strong>${escapeHtml(responderName)}</strong> απάντησε:
          </p>
          <p style="font-size:11px;color:#9E9E9E;margin:0 0 8px;">
            ${escapeHtml(formatGreekDateTime(answeredAt))}
            ${responseDuration ? ` · χρόνος απόκρισης: <strong style="color:#107C41;">${escapeHtml(responseDuration)}</strong>` : ''}
          </p>
        </div>

        <blockquote style="margin:0;padding:16px 18px;background:#E6F4EA;border-left:4px solid #107C41;border-radius:8px;font-size:14px;color:#242424;line-height:1.55;white-space:pre-wrap;word-break:break-word;">${escapeHtml(answer)}</blockquote>
        ${attachmentsBlockHtml(answerAttachments)}

        <div style="margin-top:24px;display:block;">
          ${
            questionsLink
              ? `<a href="${questionsLink}" style="display:inline-block;background:#0078D4;color:white;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:600;margin-right:8px;">Όλες οι ερωτήσεις</a>`
              : ''
          }
          ${
            taskLink
              ? `<a href="${taskLink}" style="display:inline-block;background:white;color:#0078D4;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;border:1px solid #0078D4;">Άνοιγμα εργασίας</a>`
              : ''
          }
        </div>

        ${emailFooterHtml()}
      </div>
    `;
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
  // Touch askerName to satisfy unused-binding lint when subject lines are tweaked.
  void askerName;
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

  if (!askedToId) return { ok: false as const, error: 'Επίλεξε παραλήπτη.' };
  if (question.length < 2) return { ok: false as const, error: 'Η ερώτηση είναι πολύ σύντομη.' };
  if (question.length > 4000) return { ok: false as const, error: 'Η ερώτηση είναι πολύ μεγάλη.' };
  if (askedToId === user.id) return { ok: false as const, error: 'Δεν μπορείς να ρωτήσεις τον εαυτό σου.' };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true, priority: true, startDate: true, dueDate: true },
  });
  if (!task || task.projectId !== projectId) return { ok: false as const, error: 'Η εργασία δεν βρέθηκε.' };

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
