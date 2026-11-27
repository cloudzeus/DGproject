import type { UserType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendTrackedEmail, type TrackedEmailOptions } from '@/lib/email-tracking';
import { appUrl, emailLayout, statRow } from '@/lib/email-templates';
import type { TaskStatusChangeParams } from './index';

type Recipient = {
  id: string;
  email: string;
  name: string | null;
  isAIAgent: boolean;
  userType: UserType;
};

type StatusEmailDependencies = {
  findRecipients?: (ids: string[]) => Promise<Recipient[]>;
  send?: (options: TrackedEmailOptions) => Promise<unknown>;
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Σε έλεγχο',
  done: 'Ολοκληρώθηκε',
};

function statusLabel(status: string | null): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status;
}

/** Mailgun confirmation for machine-driven MCP transitions, including the operator. */
export async function sendMcpTaskStatusEmails(
  params: TaskStatusChangeParams,
  dependencies: StatusEmailDependencies = {},
): Promise<{ sent: number; failed: number }> {
  if (params.from === params.to) return { sent: 0, failed: 0 };

  const ids = Array.from(new Set([
    params.actorId,
    params.createdById,
    params.ownerId,
    ...(params.approverId ? [params.approverId] : []),
    ...params.assigneeIds,
  ].filter(Boolean)));
  if (ids.length === 0) return { sent: 0, failed: 0 };

  const findRecipients = dependencies.findRecipients ?? ((recipientIds: string[]) => prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, email: true, name: true, isAIAgent: true, userType: true },
  }));
  const send = dependencies.send ?? sendTrackedEmail;
  const recipients = await findRecipients(ids);
  const subject = `[${params.projectName}] Αλλαγή κατάστασης: ${params.taskTitle}`;
  const result = { sent: 0, failed: 0 };

  for (const recipient of recipients) {
    if (recipient.isAIAgent || recipient.userType !== 'employee' || !recipient.email.trim()) continue;
    const html = emailLayout({
      recipientName: recipient.name ?? recipient.email,
      header: {
        kicker: { text: 'Αλλαγή κατάστασης', tone: 'info' },
        eyebrow: { text: params.projectName },
        title: params.taskTitle,
      },
      body: `
        <p style="font-size:14px;line-height:1.55;margin:0 0 14px;">Η κατάσταση της εργασίας ενημερώθηκε.</p>
        ${statRow([
          { label: 'Προηγούμενη κατάσταση', value: statusLabel(params.from) },
          { label: 'Νέα κατάσταση', value: statusLabel(params.to), tone: 'info' },
        ])}
      `,
      actions: [{
        label: 'Άνοιγμα εργασίας',
        url: appUrl(`/projects/${params.projectId}?task=${params.taskId}`),
        variant: 'primary',
      }],
    });

    try {
      await send({
        to: recipient.email.trim(),
        subject,
        html,
        text: `${params.projectName} — ${params.taskTitle}: ${statusLabel(params.from)} → ${statusLabel(params.to)}`,
        projectId: params.projectId,
        taskId: params.taskId,
        userId: params.actorId,
        note: 'mcp_status',
        bodyPreview: `${params.taskTitle}: ${statusLabel(params.from)} → ${statusLabel(params.to)}`,
      });
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      console.error(`[notifications] MCP status email to ${recipient.email} failed for task ${params.taskId}:`, error);
    }
  }
  return result;
}
