/**
 * Branded email layout system for A-Sisyphus.
 *
 * The constraints of email HTML are stricter than the web — most clients ignore
 * external CSS, custom fonts, and modern layout primitives. This file gives every
 * outgoing email the same structure: outer table for client compatibility, an
 * "eyebrow" kicker, a colored project header band, optional metadata pills, a
 * content body, primary/secondary buttons, and a consistent footer.
 *
 * All callers should construct the body via these helpers rather than ad-hoc HTML
 * to keep the visual language consistent.
 */

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

export const BRAND = {
  name: 'A-Sisyphus',
  primary: '#0078D4',
  primaryDark: '#005A9E',
  text: '#202020',
  textSoft: '#5D5D5D',
  textDim: '#9E9E9E',
  border: '#EAEAEA',
  bg: '#FAFAFA',
  card: '#FFFFFF',
  success: '#107C41',
  successBg: '#E6F4EA',
  warning: '#D87A00',
  warningBg: '#FFF8E5',
  danger: '#C50F1F',
  info: '#0078D4',
  infoBg: '#E8F4FD',
} as const;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function appUrl(path = ''): string {
  if (!APP_URL) return '';
  const base = APP_URL.replace(/\/$/, '');
  if (!path) return base;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

export function formatGreekDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleString('el-GR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return 'λιγότερο από ένα λεπτό';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} λεπτό${min === 1 ? '' : 'ά'}`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} ώρ${hr === 1 ? 'α' : 'ες'}`;
  const days = Math.round(hr / 24);
  return `${days} ημέρ${days === 1 ? 'α' : 'ες'}`;
}

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

export function priorityLabel(p: string): string {
  return PRIORITY_LABEL[p] ?? p;
}
export function priorityColor(p: string): string {
  return PRIORITY_COLOR[p] ?? '#8A8A8A';
}

// ──────────────────────────── Atomic blocks ────────────────────────────

export function pill(text: string, opts?: { color?: string; bg?: string; bold?: boolean }): string {
  const fg = opts?.color ?? BRAND.textSoft;
  const bg = opts?.bg ?? '#EFEFEF';
  const weight = opts?.bold ? 600 : 500;
  return `<span style="display:inline-block;font-size:11px;font-weight:${weight};color:${fg};background:${bg};padding:3px 10px;border-radius:999px;margin-right:6px;margin-bottom:4px;">${escapeHtml(text)}</span>`;
}

export function priorityPill(priority: string): string {
  return pill(priorityLabel(priority), { color: 'white', bg: priorityColor(priority), bold: true });
}

export function metaTable(rows: Array<{ label: string; value: string }>): string {
  if (rows.length === 0) return '';
  const cells = rows
    .map(
      (r) => `
        <tr>
          <td style="padding:6px 16px 6px 0;color:${BRAND.textSoft};font-size:12px;width:140px;vertical-align:top;">${escapeHtml(r.label)}</td>
          <td style="padding:6px 0;color:${BRAND.text};font-size:13px;font-weight:500;">${r.value}</td>
        </tr>`,
    )
    .join('');
  return `
    <table role="presentation" style="border-collapse:collapse;margin:0 0 16px;width:100%;">
      ${cells}
    </table>`;
}

export type Quote = {
  body: string;
  tone?: 'info' | 'success' | 'warning' | 'neutral';
  caption?: string;
};

export function quote({ body, tone = 'info', caption }: Quote): string {
  const palette =
    tone === 'success'
      ? { bg: BRAND.successBg, border: BRAND.success }
      : tone === 'warning'
      ? { bg: BRAND.warningBg, border: BRAND.warning }
      : tone === 'neutral'
      ? { bg: '#FAFAFA', border: '#C7C7C7' }
      : { bg: BRAND.infoBg, border: BRAND.info };

  const captionLine = caption
    ? `<div style="font-size:11px;color:${BRAND.textDim};margin:0 0 6px;">${escapeHtml(caption)}</div>`
    : '';

  return `
    ${captionLine}
    <blockquote style="margin:0 0 16px;padding:14px 18px;background:${palette.bg};border-left:4px solid ${palette.border};border-radius:8px;font-size:14px;color:${BRAND.text};line-height:1.55;white-space:pre-wrap;word-break:break-word;">${escapeHtml(body)}</blockquote>`;
}

export type Attachment = { name: string; title?: string | null; url: string };

export function attachmentsBlock(attachments: Attachment[]): string {
  if (!attachments || attachments.length === 0) return '';
  const items = attachments
    .map((a) => {
      const label = a.title || a.name;
      return `
        <li style="margin-bottom:6px;list-style:none;">
          <a href="${escapeHtml(a.url)}" style="color:${BRAND.primary};text-decoration:none;font-size:13px;font-weight:500;">📎 ${escapeHtml(label)}</a>
          ${a.title ? `<span style="color:${BRAND.textDim};font-size:11px;margin-left:6px;">(${escapeHtml(a.name)})</span>` : ''}
        </li>`;
    })
    .join('');
  return `
    <div style="margin:8px 0 16px;padding:12px 14px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:8px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.textDim};margin-bottom:6px;">
        Συνημμένα · ${attachments.length}
      </div>
      <ul style="list-style:none;padding:0;margin:0;">${items}</ul>
    </div>`;
}

export type ActionButton = { label: string; url: string; variant?: 'primary' | 'secondary' };

function buttonHtml({ label, url, variant = 'primary' }: ActionButton): string {
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? '#FFFFFF' : BRAND.primary;
  const bg = isPrimary ? BRAND.primary : '#FFFFFF';
  const border = isPrimary ? BRAND.primary : BRAND.primary;
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px;font-weight:600;border:1px solid ${border};margin:4px 8px 4px 0;">${escapeHtml(label)}</a>`;
}

export function actions(buttons: ActionButton[]): string {
  if (buttons.length === 0) return '';
  return `<div style="margin:24px 0 8px;">${buttons.map(buttonHtml).join('')}</div>`;
}

// ──────────────────────────── Report-style atoms ────────────────────────────

export type StatTileTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export type StatTile = {
  label: string;
  value: string | number;
  tone?: StatTileTone;
};

const STAT_TONE_COLOR: Record<StatTileTone, string> = {
  default: BRAND.text,
  success: BRAND.success,
  warning: BRAND.warning,
  danger: BRAND.danger,
  info: BRAND.info,
};

/**
 * A single stat tile used inside `statRow`. Always renders inside a `<td>` so
 * email clients hold the column layout.
 */
export function statTile({ label, value, tone = 'default' }: StatTile): string {
  const accent = STAT_TONE_COLOR[tone];
  return `
    <td style="padding:6px;vertical-align:top;">
      <div style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;padding:12px 14px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.textDim};">${escapeHtml(label)}</div>
        <div style="font-size:22px;font-weight:700;color:${accent};margin-top:4px;line-height:1.1;">${escapeHtml(String(value))}</div>
      </div>
    </td>`;
}

/** Lays out 1–4 stat tiles as a single equal-width row. */
export function statRow(tiles: StatTile[]): string {
  if (tiles.length === 0) return '';
  const widthPct = `${Math.floor(100 / tiles.length)}%`;
  // Re-render each tile but with the col width applied; statTile already opens its own <td>.
  const cells = tiles
    .map((t) =>
      statTile(t).replace('<td style="padding:6px;', `<td style="width:${widthPct};padding:6px;`),
    )
    .join('');
  return `
    <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 -6px 8px;">
      <tr>${cells}</tr>
    </table>`;
}

/** A 0–100 progress bar with a colored fill and percentage on the right. */
export function progressBar(pct: number, color: string = BRAND.primary): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return `
    <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 18px;">
      <tr>
        <td style="padding-right:10px;vertical-align:middle;">
          <div style="height:8px;background:#EEE;border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${clamped}%;background:${color};border-radius:999px;"></div>
          </div>
        </td>
        <td style="width:48px;vertical-align:middle;text-align:right;font-size:13px;font-weight:700;color:${BRAND.text};">${clamped}%</td>
      </tr>
    </table>`;
}

/** A horizontal divider between report sections. */
export function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.border};margin:18px 0;" />`;
}

/** A "section header" with a colored dot, label, and optional count. */
export function sectionHeader({
  label,
  color,
  count,
}: {
  label: string;
  color: string;
  count?: number;
}): string {
  const countSpan =
    typeof count === 'number'
      ? `<span style="font-size:11px;color:${BRAND.textDim};margin-left:6px;">· ${count}</span>`
      : '';
  return `
    <div style="display:flex;align-items:center;gap:8px;margin:16px 0 8px;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${color};"></span>
      <span style="font-size:13px;font-weight:700;color:${BRAND.text};">${escapeHtml(label)}</span>
      ${countSpan}
    </div>`;
}

/**
 * Initials avatar circle. Email clients can't load arbitrary CSS so we render
 * the user's initials inside a colored circle. Color stays consistent for the
 * same name (hash → palette index).
 */
const AVATAR_PALETTE = [
  '#0078D4',
  '#107C41',
  '#D83B01',
  '#8764B8',
  '#C50F1F',
  '#0099BC',
  '#E3008C',
  '#5C2E91',
];

export function avatarCircle(
  name: string,
  opts?: { size?: number; color?: string },
): string {
  const size = opts?.size ?? 28;
  // Take up to two initials.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  const initials = (first + second).toUpperCase();
  const hash = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const color = opts?.color ?? AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  return `
    <span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;border-radius:999px;background:${color};color:#FFFFFF;font-size:${Math.round(size * 0.42)}px;font-weight:700;text-align:center;letter-spacing:0.02em;">${escapeHtml(initials)}</span>`;
}

/** A row showing a person's avatar, primary line and secondary line. */
export function personRow({
  name,
  email,
  role,
  badge,
}: {
  name: string;
  email?: string;
  role?: string;
  /** A small uppercase chip rendered before the name (e.g. "OWNER"). */
  badge?: { label: string; color?: string };
}): string {
  const badgeHtml = badge
    ? `<span style="display:inline-block;font-size:10px;font-weight:700;color:white;background:${badge.color ?? BRAND.primary};padding:1px 8px;border-radius:999px;margin-right:6px;">${escapeHtml(badge.label)}</span>`
    : '';
  const meta: string[] = [];
  if (email) meta.push(escapeHtml(email));
  if (role) meta.push(escapeHtml(role));
  return `
    <table role="presentation" style="border-collapse:collapse;width:100%;margin-bottom:6px;">
      <tr>
        <td style="width:36px;padding-right:10px;vertical-align:middle;">${avatarCircle(name, { size: 28 })}</td>
        <td style="vertical-align:middle;">
          <div style="font-size:13px;color:${BRAND.text};">${badgeHtml}<strong>${escapeHtml(name)}</strong></div>
          ${meta.length ? `<div style="font-size:11px;color:${BRAND.textDim};">${meta.join(' · ')}</div>` : ''}
        </td>
      </tr>
    </table>`;
}

export type CardTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const CARD_TONE_BG: Record<CardTone, string> = {
  neutral: BRAND.card,
  info: BRAND.infoBg,
  success: BRAND.successBg,
  warning: BRAND.warningBg,
  danger: '#FCEAEA',
};
const CARD_TONE_BORDER: Record<CardTone, string> = {
  neutral: BRAND.border,
  info: '#BEE2FA',
  success: '#A5DCB6',
  warning: '#FFE08A',
  danger: '#F2B8B8',
};

/**
 * Generic content card. Use to wrap a content block in a soft tinted container,
 * matching the report's "info card" / "credential card" look.
 */
export function infoCard(html: string, opts?: { tone?: CardTone; padded?: boolean }): string {
  const tone = opts?.tone ?? 'neutral';
  const padding = opts?.padded === false ? '0' : '14px 16px';
  return `
    <div style="background:${CARD_TONE_BG[tone]};border:1px solid ${CARD_TONE_BORDER[tone]};border-radius:10px;padding:${padding};margin:0 0 16px;">
      ${html}
    </div>`;
}

/**
 * Numbered checklist commonly used for "what's next" sections in onboarding /
 * notification emails. Each step renders as a row with a circular index badge.
 */
export function checklist(steps: string[]): string {
  if (steps.length === 0) return '';
  const items = steps
    .map(
      (s, i) => `
      <tr>
        <td style="width:28px;padding:8px 12px 8px 0;vertical-align:top;">
          <span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:999px;background:${BRAND.infoBg};color:${BRAND.primary};font-size:12px;font-weight:700;text-align:center;">${i + 1}</span>
        </td>
        <td style="padding:8px 0;font-size:13px;color:${BRAND.text};line-height:1.5;vertical-align:top;">
          ${s}
        </td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" style="border-collapse:collapse;margin:0 0 16px;">${items}</table>`;
}

// ──────────────────────────── Layout shell ────────────────────────────

export type EmailKickerTone = 'info' | 'success' | 'warning' | 'neutral';

const KICKER_COLOR: Record<EmailKickerTone, string> = {
  info: BRAND.info,
  success: BRAND.success,
  warning: BRAND.warning,
  neutral: BRAND.textSoft,
};

export type EmailHeader = {
  // Section eyebrow above the headline (e.g. "❓ Νέα ερώτηση"). Tone colors the text.
  kicker?: { text: string; tone?: EmailKickerTone };
  // Pre-headline label (e.g. project name) shown above the title.
  eyebrow?: { text: string; color?: string };
  // Main headline (usually task title or page subject).
  title: string;
  // Optional sub-line (e.g. priority pill row).
  pillsHtml?: string;
};

export type EmailLayoutInput = {
  // Recipient name to address them ("Γεια σου, X"). Pass null/'' to skip.
  recipientName?: string | null;
  // Pre-built header section (eyebrow + title).
  header: EmailHeader;
  // Body HTML (use other helpers — quote, metaTable, attachmentsBlock).
  body: string;
  // Action buttons (primary first).
  actions?: ActionButton[];
  // Footer note tone-aware.
  footerNote?: string;
};

export function emailLayout(input: EmailLayoutInput): string {
  const { recipientName, header, body, actions: btns = [], footerNote } = input;
  const greeting = recipientName
    ? `<p style="font-size:14px;color:${BRAND.text};line-height:1.5;margin:0 0 12px;">Γεια σου ${escapeHtml(recipientName)},</p>`
    : '';
  const kicker = header.kicker
    ? `<div style="display:inline-block;font-size:11px;font-weight:700;color:${KICKER_COLOR[header.kicker.tone ?? 'info']};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">${escapeHtml(header.kicker.text)}</div>`
    : '';
  const eyebrowColor = header.eyebrow?.color ?? BRAND.primary;
  const eyebrowHtml = header.eyebrow
    ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${eyebrowColor};margin-bottom:4px;">${escapeHtml(header.eyebrow.text)}</div>`
    : '';
  const accentColor = header.eyebrow?.color ?? BRAND.primary;
  const headerBlock = `
    <div style="border-left:4px solid ${accentColor};padding-left:16px;margin:0 0 20px;">
      ${eyebrowHtml}
      <h1 style="margin:2px 0 0;font-size:22px;line-height:1.3;font-weight:600;color:${BRAND.text};">${escapeHtml(header.title)}</h1>
      ${header.pillsHtml ? `<div style="margin-top:10px;">${header.pillsHtml}</div>` : ''}
    </div>`;

  const actionsBlock = btns.length ? actions(btns) : '';
  const footer = `
    <hr style="border:none;border-top:1px solid ${BRAND.border};margin:28px 0 14px;" />
    <p style="font-size:11px;color:${BRAND.textDim};margin:0;line-height:1.55;">
      Στάλθηκε αυτόματα από το <strong style="color:${BRAND.textSoft};">A-Sisyphus</strong>.
      ${footerNote ? `<br />${escapeHtml(footerNote)}` : ''}
    </p>`;

  return `<!doctype html>
<html lang="el">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(header.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:14px;max-width:640px;width:100%;">
            <tr>
              <td style="padding:28px 28px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                  <tr>
                    <td style="font-size:14px;font-weight:700;letter-spacing:0.04em;color:${BRAND.text};">
                      ${escapeHtml(BRAND.name)}
                    </td>
                    <td align="right" style="font-size:11px;color:${BRAND.textDim};">
                      ${appUrl() ? `<a href="${escapeHtml(appUrl())}" style="color:${BRAND.textDim};text-decoration:none;">${escapeHtml(appUrl().replace(/^https?:\/\//, ''))}</a>` : ''}
                    </td>
                  </tr>
                </table>
                ${kicker}
                ${headerBlock}
                ${greeting}
                ${body}
                ${actionsBlock}
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
