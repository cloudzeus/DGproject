import { sendEmail } from './mailgun';
import { emailLayout, escapeHtml, appUrl, BRAND } from './email-templates';

export type SendCredentialsEmailInput = {
  to: string;
  name: string;
  tempPassword: string;
  /** 'invite' for first-time, 'reset' when admin re-issues credentials */
  reason?: 'invite' | 'reset';
  /** Optional invited-by display name (admin who created/reset) */
  invitedByName?: string;
};

export async function sendCredentialsEmail(input: SendCredentialsEmailInput): Promise<void> {
  const { to, name, tempPassword, reason = 'invite', invitedByName } = input;
  const signinUrl = appUrl('/auth/signin') || '/auth/signin';

  const heading = reason === 'reset' ? 'Νέος προσωρινός κωδικός' : 'Καλώς ήρθες στο A-Sisyphus';
  const lead =
    reason === 'reset'
      ? 'Ο διαχειριστής δημιούργησε για εσένα νέο προσωρινό κωδικό. Χρησιμοποίησέ τον για να συνδεθείς και θα σου ζητηθεί να ορίσεις νέο.'
      : 'Δημιουργήθηκε λογαριασμός για εσένα στο A-Sisyphus. Παρακάτω θα βρεις τα στοιχεία πρόσβασής σου.';

  const inviterLine = invitedByName
    ? `<p style="font-size:13px;color:${BRAND.textSoft};margin:0 0 16px;">Ο/Η <strong>${escapeHtml(invitedByName)}</strong> ${reason === 'reset' ? 'εξέδωσε νέο κωδικό για εσένα' : 'σε προσκάλεσε στο A-Sisyphus'}.</p>`
    : '';

  // The credentials card is one of the few places we deviate from the standard
  // body helpers — it needs a high-contrast monospace block for the password.
  const credentialsCard = `
    <div style="background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;padding:18px 20px;margin:0 0 20px;">
      <table role="presentation" style="border-collapse:collapse;width:100%;">
        <tr>
          <td style="padding:6px 16px 6px 0;color:${BRAND.textSoft};font-size:12px;width:140px;">Email</td>
          <td style="padding:6px 0;color:${BRAND.text};font-size:14px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${escapeHtml(to)}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px 6px 0;color:${BRAND.textSoft};font-size:12px;vertical-align:top;">Προσωρινός κωδικός</td>
          <td style="padding:10px 0 6px;">
            <code style="display:inline-block;font-size:16px;font-weight:700;letter-spacing:0.05em;background:${BRAND.card};border:1px dashed ${BRAND.primary};padding:10px 14px;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${BRAND.primary};">${escapeHtml(tempPassword)}</code>
          </td>
        </tr>
      </table>
    </div>
  `;

  const securityNotice = `
    <div style="background:${BRAND.warningBg};border:1px solid #FFE08A;border-radius:8px;padding:12px 14px;margin:0 0 8px;">
      <p style="font-size:13px;color:#7A4F01;margin:0;line-height:1.55;">
        <strong>Σημαντικό:</strong> Ο κωδικός είναι προσωρινός. Στην πρώτη σου σύνδεση θα σου ζητηθεί
        να ορίσεις νέο, προσωπικό κωδικό. Μην τον κοινοποιήσεις σε κανέναν.
      </p>
    </div>
  `;

  const body = `
    <p style="font-size:14px;color:${BRAND.text};line-height:1.55;margin:0 0 12px;">
      ${escapeHtml(lead)}
    </p>
    ${inviterLine}
    ${credentialsCard}
    ${securityNotice}
  `;

  const html = emailLayout({
    recipientName: name || to,
    header: {
      kicker: {
        text: reason === 'reset' ? '🔐 Επαναφορά κωδικού' : '🎉 Πρόσκληση',
        tone: reason === 'reset' ? 'warning' : 'info',
      },
      title: heading,
    },
    body,
    actions: [{ label: 'Σύνδεση στο A-Sisyphus', url: signinUrl, variant: 'primary' }],
    footerNote:
      'Αν δεν αναμένεις αυτό το email, αγνόησέ το ή ενημέρωσε τον διαχειριστή του συστήματος. Δεν θα ξανασταλεί ο ίδιος κωδικός — μετά τη σύνδεσή σου τα παλαιά στοιχεία ακυρώνονται.',
  });

  const text = [
    heading,
    '',
    `Email: ${to}`,
    `Προσωρινός κωδικός: ${tempPassword}`,
    '',
    `Σύνδεση: ${signinUrl}`,
    '',
    'Στην πρώτη σύνδεση θα σου ζητηθεί να ορίσεις νέο κωδικό.',
  ].join('\n');

  await sendEmail({
    to,
    subject:
      reason === 'reset'
        ? '[A-Sisyphus] Νέος προσωρινός κωδικός'
        : '[A-Sisyphus] Πρόσκληση και στοιχεία πρόσβασης',
    html,
    text,
  });
}
