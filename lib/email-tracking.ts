import { prisma } from '@/lib/prisma';
import {
  fetchMailgunEvents,
  getMailgunFromAddress,
  normalizeMailgunMessageId,
  sendEmail,
  type MailgunEvent,
  type SendEmailOptions,
} from '@/lib/mailgun';

export type TrackedEmailOptions = SendEmailOptions & {
  projectId: string;
  taskId?: string | null;
  questionId?: string | null;
  userId: string;
  /** Stable category used to associate question/answer badges with their email. */
  note?: string | null;
  bodyPreview?: string | null;
};

type EmailAuditData = {
  direction: 'outbound';
  status: 'sent' | 'failed';
  projectId: string;
  taskId: string | null;
  questionId: string | null;
  userId: string;
  subject: string;
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string | null;
  bodyHtml: string;
  bodyPreview: string | null;
  sentAt: Date;
  appliedNote: string | null;
  mailgunMessageId: string | null;
  deliveryError: string | null;
};

type TrackedEmailDependencies = {
  send?: (options: SendEmailOptions) => Promise<{ id?: string | null }>;
  getFromAddress?: () => Promise<string>;
  createRecord?: (data: EmailAuditData) => Promise<unknown>;
  now?: () => Date;
};

function addresses(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function preview(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Send one Mailgun message with delivery/open tracking and keep it in the same
 * project Email history as Outlook messages. A database failure after Mailgun
 * accepted the message is logged, never misreported as an email-send failure.
 */
export async function sendTrackedEmail(
  options: TrackedEmailOptions,
  dependencies: TrackedEmailDependencies = {},
): Promise<{ id?: string | null }> {
  const {
    projectId,
    taskId = null,
    questionId = null,
    userId,
    note = null,
    bodyPreview = null,
    ...emailOptions
  } = options;
  const send = dependencies.send ?? sendEmail;
  const getFromAddress = dependencies.getFromAddress ?? getMailgunFromAddress;
  const createRecord =
    dependencies.createRecord ?? (async (data: EmailAuditData) => prisma.emailMessage.create({ data }));
  const now = dependencies.now ?? (() => new Date());
  const sentAt = now();
  const fromAddress = options.from ?? (await getFromAddress().catch(() => 'Mailgun'));
  const base: EmailAuditData = {
    direction: 'outbound',
    status: 'sent',
    projectId,
    taskId,
    questionId,
    userId,
    subject: options.subject,
    fromAddress,
    toAddresses: addresses(options.to).join(', '),
    ccAddresses: addresses(options.cc).join(', ') || null,
    bodyHtml: options.html,
    bodyPreview: bodyPreview ?? preview(options.html),
    sentAt,
    appliedNote: note,
    mailgunMessageId: null,
    deliveryError: null,
  };

  let result: { id?: string | null };
  try {
    result = await send({ ...emailOptions, tracking: true });
  } catch (error) {
    await createRecord({
      ...base,
      status: 'failed',
      deliveryError: errorMessage(error).slice(0, 1000),
    }).catch((auditError) => console.error('[email tracking] failed to audit send failure:', auditError));
    throw error;
  }

  await createRecord({
    ...base,
    mailgunMessageId: normalizeMailgunMessageId(result.id),
  }).catch((auditError) => console.error('[email tracking] failed to audit sent message:', auditError));
  return result;
}

function primaryRecipient(toAddresses: string): string | null {
  const first = toAddresses.split(',')[0]?.trim() ?? '';
  const bracketed = first.match(/<([^>]+)>/)?.[1];
  return (bracketed ?? first).trim().toLowerCase() || null;
}

export type EmailTrackingSnapshot = {
  status: 'sent' | 'failed';
  deliveredAt: Date | null;
  openedAt: Date | null;
  openCount: number;
  lastOpenedAt: Date | null;
  deliveryError: string | null;
};

/** Convert actual Mailgun events into a monotonic tracking snapshot. */
export function summarizeMailgunTracking(
  events: MailgunEvent[],
  toAddresses: string,
  current: EmailTrackingSnapshot,
): EmailTrackingSnapshot {
  const recipient = primaryRecipient(toAddresses);
  const own = recipient
    ? events.filter((event) => event.recipient?.toLowerCase() === recipient)
    : events;
  const delivered = own.filter((event) => event.event === 'delivered');
  const opened = own.filter((event) => event.event === 'opened');
  const failed = own.find((event) => event.event === 'failed');

  if (failed) {
    return {
      ...current,
      status: 'failed',
      deliveryError: JSON.stringify(
        (failed as Record<string, unknown>).reason ?? (failed as Record<string, unknown>).severity ?? 'Mailgun delivery failed',
      ).slice(0, 1000),
    };
  }

  const deliveredAt = delivered.length
    ? new Date(Math.min(...delivered.map((event) => event.timestamp)) * 1000)
    : current.deliveredAt;
  const openedAt = opened.length
    ? new Date(Math.min(...opened.map((event) => event.timestamp)) * 1000)
    : current.openedAt;
  const lastOpenedAt = opened.length
    ? new Date(Math.max(...opened.map((event) => event.timestamp)) * 1000)
    : current.lastOpenedAt;

  return {
    status: current.status,
    deliveredAt,
    openedAt,
    openCount: opened.length > 0 ? opened.length : current.openCount,
    lastOpenedAt,
    deliveryError: current.deliveryError,
  };
}

type RefreshDependencies = {
  fetchEvents?: typeof fetchMailgunEvents;
  now?: () => Date;
};

/**
 * Refresh recent, not-yet-opened project emails. The 30-second throttle keeps
 * repeated page refreshes from hammering Mailgun; per-message failures do not
 * prevent the remaining messages or the project page from loading.
 */
export async function refreshProjectEmailTracking(
  projectId: string,
  dependencies: RefreshDependencies = {},
): Promise<{ checked: number; updated: number; errors: number }> {
  const fetchEvents = dependencies.fetchEvents ?? fetchMailgunEvents;
  const now = dependencies.now ?? (() => new Date());
  const checkedAt = now();
  const messages = await prisma.emailMessage.findMany({
    where: {
      projectId,
      direction: 'outbound',
      status: 'sent',
      mailgunMessageId: { not: null },
      openedAt: null,
      sentAt: { gte: new Date(checkedAt.getTime() - 30 * 86400000) },
      OR: [
        { lastEventAt: null },
        { lastEventAt: { lt: new Date(checkedAt.getTime() - 30000) } },
      ],
    },
    orderBy: { sentAt: 'desc' },
    take: 25,
  });

  const result = { checked: 0, updated: 0, errors: 0 };
  for (let offset = 0; offset < messages.length; offset += 4) {
    await Promise.all(messages.slice(offset, offset + 4).map(async (message) => {
      if (!message.mailgunMessageId) return;
      result.checked += 1;
      try {
        const events = await fetchEvents({
          messageId: message.mailgunMessageId,
          events: ['delivered', 'opened', 'failed'],
          limit: 50,
        });
        const snapshot = summarizeMailgunTracking(events, message.toAddresses, {
          status: 'sent',
          deliveredAt: message.deliveredAt,
          openedAt: message.openedAt,
          openCount: message.openCount,
          lastOpenedAt: message.lastOpenedAt,
          deliveryError: message.deliveryError,
        });
        await prisma.emailMessage.update({
          where: { id: message.id },
          data: { ...snapshot, lastEventAt: checkedAt },
        });
        result.updated += 1;
      } catch (error) {
        result.errors += 1;
        console.warn(`[email tracking] refresh failed for ${message.id}:`, errorMessage(error));
      }
    }));
  }
  return result;
}
