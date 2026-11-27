import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SendEmailOptions } from '@/lib/mailgun';

const mailgun = require('@/lib/mailgun') as typeof import('@/lib/mailgun');
const {
  TASK_REPLY_INSTRUCTIONS,
  sendTicketStatusEmail,
  sendTicketResolvedEmail,
} = require('@/lib/tickets/emails') as typeof import('@/lib/tickets/emails');

const input = {
  to: 'customer@example.com',
  reporterName: 'Πελάτης',
  code: 'TKT-2026-001',
  subject: 'Δοκιμαστικό αίτημα',
  publicToken: 'public-token',
};

async function captureSend(run: () => Promise<unknown>): Promise<SendEmailOptions[]> {
  const sent: SendEmailOptions[] = [];
  const original = mailgun.sendEmail;
  mailgun.sendEmail = (async (options: SendEmailOptions) => {
    sent.push(options);
    return { id: '<test-message-id>' };
  }) as typeof mailgun.sendEmail;
  try {
    await run();
  } finally {
    mailgun.sendEmail = original;
  }
  return sent;
}

test('task status email contains the complete reply instructions', async () => {
  const sent = await captureSend(() => sendTicketStatusEmail({ ...input, statusLabel: 'Σε εξέλιξη' }));

  assert.equal(sent.length, 1);
  assert.ok(sent[0].html.includes(TASK_REPLY_INSTRUCTIONS));
  assert.match(sent[0].html, /πατήστε «Απάντηση»/);
  assert.match(sent[0].html, /χωρίς να αλλάξετε το θέμα/);
  assert.match(sent[0].html, /αυτόματα στη συγκεκριμένη εργασία/);
});

test('task completion email contains the same reply instructions', async () => {
  const sent = await captureSend(() => sendTicketResolvedEmail(input));

  assert.equal(sent.length, 1);
  assert.ok(sent[0].html.includes(TASK_REPLY_INSTRUCTIONS));
  assert.match(sent[0].html, /Δεν χρειάζεται να συνδεθείτε στην πλατφόρμα ή να δημιουργήσετε νέο αίτημα/);
});
