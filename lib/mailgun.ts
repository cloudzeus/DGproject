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
}

export async function sendEmail(options: SendEmailOptions) {
  try {
    const { client, domain, from } = await getClient();
    if (!domain) throw new Error('Mailgun domain not configured');
    const fromAddr = options.from || from;
    if (!fromAddr) throw new Error('Mailgun from address not configured');

    const message = {
      from: fromAddr,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: options.cc,
      bcc: options.bcc,
    };

    const result = await client.messages.create(domain, message);
    console.log('✅ Email sent:', result.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
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
