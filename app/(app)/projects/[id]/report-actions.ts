'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailgun';
import { buildProjectReportHtml, loadProjectForReport } from '@/lib/project-report';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireProjectReporter(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role === 'viewer') throw new Error('Forbidden');
  if (role === 'admin' || role === 'manager') return session.user;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error('Project not found');
  if (project.ownerId !== session.user.id) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: session.user.id } },
    });
    if (!member) throw new Error('Forbidden');
  }
  return session.user;
}

export async function sendProjectReport(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const sender = await requireProjectReporter(projectId);

  const recipients = String(formData.get('recipients') ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { ok: false, error: 'Πρόσθεσε τουλάχιστον έναν παραλήπτη.' };
  }
  for (const email of recipients) {
    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: `Μη έγκυρο email: ${email}` };
    }
  }

  const recipientName = String(formData.get('recipientName') ?? '').trim() || undefined;
  const coverMessage = String(formData.get('coverMessage') ?? '').trim() || undefined;
  const ccSelf = String(formData.get('ccSelf') ?? '') === 'on';

  const project = await loadProjectForReport(projectId);
  if (!project) return { ok: false, error: 'Το έργο δεν βρέθηκε.' };

  const senderName = sender.name ?? sender.email ?? 'A-Sisyphus';
  const html = buildProjectReportHtml({
    project,
    recipientName,
    coverMessage,
    senderName,
  });

  const subject = `[A-Sisyphus] Αναφορά έργου: ${project.name}`;
  try {
    await sendEmail({
      to: recipients,
      cc: ccSelf && sender.email ? [sender.email] : undefined,
      subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error && e.message
        ? e.message
        : 'Αποτυχία αποστολής. Έλεγξε τις ρυθμίσεις Mailgun.';
    return { ok: false, error: msg };
  }
}

/**
 * Returns a self-contained HTML string for in-browser preview. The same content
 * that gets emailed, just wrapped without going through Mailgun.
 */
export async function buildProjectReportPreview(projectId: string): Promise<{
  ok: boolean;
  html?: string;
  error?: string;
}> {
  const sender = await requireProjectReporter(projectId);
  const project = await loadProjectForReport(projectId);
  if (!project) return { ok: false, error: 'Το έργο δεν βρέθηκε.' };
  const html = buildProjectReportHtml({
    project,
    senderName: sender.name ?? sender.email ?? 'A-Sisyphus',
  });
  return { ok: true, html };
}
