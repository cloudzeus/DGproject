import Mailgun from 'mailgun.js';
import FormData from 'form-data';

const mailgun = new Mailgun(FormData);
const region = (process.env.MAILGUN_REGION || 'us').toLowerCase();
const defaultUrl = region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
const client = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
  url: process.env.MAILGUN_URL || defaultUrl,
});

const domain = process.env.MAILGUN_DOMAIN || '';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: any[];
}

export async function sendEmail(options: SendEmailOptions) {
  try {
    const message = {
      from: options.from || `noreply@${domain}`,
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
  options?: Partial<SendEmailOptions>
) {
  return sendEmail({
    to,
    subject,
    html: htmlContent,
    ...options,
  });
}
