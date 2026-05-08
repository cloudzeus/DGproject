import { sendEmail } from './mailgun';

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

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
  const signinUrl = APP_URL ? `${APP_URL.replace(/\/$/, '')}/auth/signin` : '/auth/signin';

  const heading = reason === 'reset' ? 'Νέος προσωρινός κωδικός' : 'Καλώς ήρθες στο A-Sisyphus';
  const lead =
    reason === 'reset'
      ? 'Ο διαχειριστής δημιούργησε για εσένα νέο προσωρινό κωδικό. Χρησιμοποίησέ τον για να συνδεθείς και θα σου ζητηθεί να ορίσεις νέο.'
      : 'Δημιουργήθηκε λογαριασμός για εσένα στο A-Sisyphus. Παρακάτω θα βρεις τα στοιχεία πρόσβασης.';

  const inviterLine = invitedByName
    ? `<p style="font-size:13px;color:#616161;margin:0 0 16px;">Ο/Η <strong>${escapeHtml(invitedByName)}</strong> ${reason === 'reset' ? 'εξέδωσε νέο κωδικό για εσένα' : 'σε προσκάλεσε'}.</p>`
    : '';

  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f1f1f;background:#FFF;">
      <div style="display:inline-block;font-size:11px;font-weight:700;color:#0078D4;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px;">
        🔐 ${reason === 'reset' ? 'Επαναφορά κωδικού' : 'Πρόσκληση'}
      </div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#242424;line-height:1.3;">${escapeHtml(heading)}</h1>
      <p style="font-size:14px;color:#424242;line-height:1.55;margin:0 0 12px;">
        Γεια σου ${escapeHtml(name || to)},
      </p>
      <p style="font-size:14px;color:#424242;line-height:1.55;margin:0 0 16px;">
        ${escapeHtml(lead)}
      </p>
      ${inviterLine}

      <div style="background:#F5F5F5;border:1px solid #EEE;border-radius:10px;padding:18px;margin:8px 0 20px;">
        <table style="border-collapse:collapse;font-size:13px;width:100%;">
          <tr>
            <td style="padding:6px 12px 6px 0;color:#616161;width:140px;">Email</td>
            <td style="padding:6px 0;color:#242424;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${escapeHtml(to)}</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;color:#616161;">Προσωρινός κωδικός</td>
            <td style="padding:6px 0;">
              <code style="display:inline-block;font-size:15px;font-weight:700;letter-spacing:0.04em;background:#FFFFFF;border:1px solid #D1D1D1;padding:8px 12px;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#0078D4;">${escapeHtml(tempPassword)}</code>
            </td>
          </tr>
        </table>
      </div>

      <div style="background:#FFF8E5;border:1px solid #FFE08A;border-radius:8px;padding:12px 14px;margin:0 0 20px;">
        <p style="font-size:13px;color:#7A4F01;margin:0;line-height:1.5;">
          <strong>Σημαντικό:</strong> Ο κωδικός είναι προσωρινός. Στην πρώτη σου σύνδεση, θα σου ζητηθεί να ορίσεις
          νέο, προσωπικό κωδικό. Μην τον κοινοποιήσεις σε κανέναν.
        </p>
      </div>

      <a href="${signinUrl}" style="display:inline-block;background:#0078D4;color:white;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px;font-weight:600;">
        Σύνδεση στο A-Sisyphus
      </a>

      <hr style="border:none;border-top:1px solid #EEE;margin:28px 0 16px;" />
      <p style="font-size:11px;color:#9E9E9E;margin:0;line-height:1.5;">
        Αν δεν αναμένεις αυτό το email, αγνόησέ το ή ενημέρωσε τον διαχειριστή του συστήματος.
        Δεν θα ξανασταλεί ο ίδιος κωδικός — μετά τη σύνδεσή σου τα παλαιά στοιχεία ακυρώνονται.
      </p>
    </div>
  `;

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
