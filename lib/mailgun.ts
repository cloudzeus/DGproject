import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { getMailgunConfig, type MailgunConfig } from './app-settings';

const mailgunFactory = new Mailgun(FormData);

type Cached = {
  client: ReturnType<typeof mailgunFactory.client>;
  domain: string;
  from: string;
  cacheKey: string;
};

let cached: Cached | null = null;

function buildFrom(config: MailgunConfig): string {
  if (!config.fromEmail) return '';
  return config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
}

async function getClient(): Promise<{ client: Cached['client']; domain: string; from: string }> {
  const config = await getMailgunConfig();
  const url = config.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const cacheKey = `${config.apiKey}|${url}|${config.domain}|${buildFrom(config)}`;
  if (cached && cached.cacheKey === cacheKey) return cached;

  const client = mailgunFactory.client({
    username: 'api',
    key: config.apiKey || '',
    url,
  });
  cached = { client, domain: config.domain, from: buildFrom(config), cacheKey };
  return cached;
}

/** Call after persisting Mailgun settings so the next sendEmail rebuilds the client. */
export function invalidateMailgunCache(): void {
  cached = null;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: unknown[];
  /** Enable Mailgun open + click tracking. Default: false (privacy-respectful). */
  tracking?: boolean;
}

/**
 * Strip the angle brackets from a Mailgun Message-Id. Mailgun returns IDs like
 * `<20231010120000.abcdef@mg.example.com>` but the events API expects the raw
 * id without brackets in the `?message-id=` query param.
 */
export function normalizeMailgunMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.replace(/^<|>$/g, '').trim();
}

export async function sendEmail(options: SendEmailOptions) {
  try {
    const { client, domain, from } = await getClient();
    if (!domain) throw new Error('Mailgun domain not configured');
    const fromAddr = options.from || from;
    if (!fromAddr) throw new Error('Mailgun from address not configured');

    const message: Record<string, unknown> = {
      from: fromAddr,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: options.cc,
      bcc: options.bcc,
    };

    if (options.tracking) {
      // Mailgun message-level overrides — see https://documentation.mailgun.com
      message['o:tracking'] = 'yes';
      message['o:tracking-opens'] = 'yes';
      message['o:tracking-clicks'] = 'htmlonly';
    }

    // The Mailgun typings don't include the o:tracking-* override keys, so
    // we cast through Parameters[1] of messages.create which is the canonical
    // input shape. Mailgun's API accepts the extra keys silently.
    type CreateInput = Parameters<typeof client.messages.create>[1];
    const result = await client.messages.create(domain, message as unknown as CreateInput);
    console.log('✅ Email sent:', result.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Events API — poll for opens/deliveries/failures.
//
// Docs: https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Events/
// Filters by message-id (without angle brackets) and event type.
// ─────────────────────────────────────────────────────────────────────────

export type MailgunEvent = {
  event: 'accepted' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'unsubscribed' | 'complained';
  timestamp: number;            // unix seconds (float)
  recipient: string;
  message: { headers?: { 'message-id'?: string } };
  /** Raw event payload — kept opaque for forward compat. */
  [k: string]: unknown;
};

export async function fetchMailgunEvents(args: {
  messageId: string;            // without angle brackets
  events?: Array<'opened' | 'delivered' | 'failed'>;
  limit?: number;
}): Promise<MailgunEvent[]> {
  const { client, domain } = await getClient();
  if (!domain) throw new Error('Mailgun domain not configured');

  const filter: Record<string, string> = {
    'message-id': args.messageId,
    limit: String(args.limit ?? 25),
  };
  if (args.events?.length) filter.event = args.events.join(' OR ');

  // mailgun.js v10 exposes `client.events.get(domain, filter)`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.events as any).get(domain, filter);
  const items = (res?.items ?? []) as MailgunEvent[];
  return items;
}

export async function sendEmailTemplate(
  to: string | string[],
  subject: string,
  htmlContent: string,
  options?: Partial<SendEmailOptions>,
) {
  return sendEmail({
    to,
    subject,
    html: htmlContent,
    ...options,
  });
}
