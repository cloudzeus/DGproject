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
import { emailLayout, metaTable, formatGreekDateTime, BRAND as EBRAND } from '@/lib/email-templates';

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

  const senderDisplay = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
  const body = `
    <p style="font-size:14px;color:${EBRAND.text};line-height:1.55;margin:0 0 12px;">
      Αν λαμβάνεις αυτό το email, η σύνδεση του A-Sisyphus με το Mailgun λειτουργεί κανονικά.
    </p>
    ${metaTable([
      { label: 'Domain', value: escapeHtml(config.domain) },
      { label: 'Περιοχή', value: config.region.toUpperCase() },
      { label: 'Αποστολέας', value: escapeHtml(senderDisplay) },
      { label: 'Στάλθηκε', value: formatGreekDateTime(new Date()) },
    ])}
  `;

  const html = emailLayout({
    header: {
      kicker: { text: '✓ Δοκιμαστικό email', tone: 'success' },
      title: 'A-Sisyphus Mailgun OK',
    },
    body,
    footerNote: 'Αν δεν αναμένεις αυτό το email, αγνόησέ το.',
  });

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
