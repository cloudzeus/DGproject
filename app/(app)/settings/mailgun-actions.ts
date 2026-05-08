'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  getMailgunConfig,
  updateMailgunSettings,
  type MailgunConfig,
  type MailgunRegion,
} from '@/lib/app-settings';
import { invalidateMailgunCache, sendEmail } from '@/lib/mailgun';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return session.user;
}

export type MailgunSettingsView = {
  apiKeyMasked: string; // never returns the raw key
  apiKeyConfigured: boolean;
  domain: string;
  region: MailgunRegion;
  fromEmail: string;
  fromName: string;
  source: MailgunConfig['source'];
};

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

export async function getMailgunSettings(): Promise<MailgunSettingsView> {
  await requireAdmin();
  const config = await getMailgunConfig();
  return {
    apiKeyMasked: maskKey(config.apiKey),
    apiKeyConfigured: config.apiKey.length > 0,
    domain: config.domain,
    region: config.region,
    fromEmail: config.fromEmail,
    fromName: config.fromName ?? '',
    source: config.source,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export async function saveMailgunSettings(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  const apiKeyRaw = String(formData.get('apiKey') ?? '');
  const apiKeyAction = String(formData.get('apiKeyAction') ?? 'keep'); // 'keep' | 'set' | 'clear'
  const domain = String(formData.get('domain') ?? '').trim();
  const regionRaw = String(formData.get('region') ?? 'us').toLowerCase();
  const fromEmail = String(formData.get('fromEmail') ?? '').trim();
  const fromName = String(formData.get('fromName') ?? '').trim();

  if (domain.length > 0 && !DOMAIN_RE.test(domain)) {
    return { ok: false, error: 'Μη έγκυρο domain.' };
  }
  if (fromEmail.length > 0 && !EMAIL_RE.test(fromEmail)) {
    return { ok: false, error: 'Μη έγκυρο email αποστολέα.' };
  }
  const region: MailgunRegion = regionRaw === 'eu' ? 'eu' : 'us';

  const update: Parameters<typeof updateMailgunSettings>[0] = {
    domain: domain.length > 0 ? domain : null,
    region,
    fromEmail: fromEmail.length > 0 ? fromEmail : null,
    fromName: fromName.length > 0 ? fromName : null,
  };

  if (apiKeyAction === 'set') {
    const trimmed = apiKeyRaw.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: 'Δώσε έγκυρο API key ή επίλεξε εκκαθάριση.' };
    }
    update.apiKey = trimmed;
  } else if (apiKeyAction === 'clear') {
    update.apiKey = null;
  }

  await updateMailgunSettings(update);
  invalidateMailgunCache();
  revalidatePath('/settings');
  return { ok: true };
}

export async function sendMailgunTest(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const user = await requireAdmin();
  const to = String(formData.get('to') ?? '').trim() || user.email || '';
  if (!to || !EMAIL_RE.test(to)) {
    return { ok: false, error: 'Μη έγκυρο email αποδέκτη.' };
  }

  const config = await getMailgunConfig();
  if (!config.apiKey || !config.domain || !config.fromEmail) {
    return {
      ok: false,
      error: 'Συμπλήρωσε API key, domain και email αποστολέα προτού δοκιμάσεις.',
    };
  }

  // Always rebuild client against latest config
  invalidateMailgunCache();

  const sentAt = new Date().toLocaleString('el-GR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f1f1f;background:#FFF;">
      <div style="display:inline-block;font-size:11px;font-weight:700;color:#107C41;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">
        ✓ Δοκιμαστικό email
      </div>
      <h1 style="font-size:20px;font-weight:600;color:#242424;margin:0 0 8px;">A-Sisyphus Mailgun OK</h1>
      <p style="font-size:14px;color:#424242;line-height:1.55;margin:0 0 12px;">
        Αυτό είναι ένα δοκιμαστικό email από το A-Sisyphus για να επιβεβαιωθεί η σύνδεση με το Mailgun.
      </p>
      <table style="border-collapse:collapse;font-size:13px;margin:8px 0 16px;">
        <tr><td style="padding:4px 12px 4px 0;color:#616161;">Domain</td><td style="padding:4px 0;color:#242424;font-weight:500;">${escapeHtml(config.domain)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#616161;">Περιοχή</td><td style="padding:4px 0;color:#242424;font-weight:500;">${config.region.toUpperCase()}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#616161;">Αποστολέας</td><td style="padding:4px 0;color:#242424;font-weight:500;">${escapeHtml(config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#616161;">Στάλθηκε</td><td style="padding:4px 0;color:#242424;font-weight:500;">${escapeHtml(sentAt)}</td></tr>
      </table>
      <p style="font-size:11px;color:#9E9E9E;margin:0;">
        Αν λάβεις αυτό το email, η σύνδεση Mailgun είναι εντάξει.
      </p>
    </div>
  `;

  try {
    const result = await sendEmail({
      to,
      subject: '[A-Sisyphus] Δοκιμαστικό email Mailgun',
      html,
    });
    const messageId =
      typeof result === 'object' && result && 'id' in result
        ? String((result as { id?: unknown }).id ?? '')
        : '';
    return { ok: true, messageId };
  } catch (e) {
    const msg =
      e instanceof Error && e.message
        ? e.message
        : 'Αποτυχία αποστολής. Έλεγξε το API key και το domain.';
    return { ok: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
