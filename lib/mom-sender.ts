import { prisma } from './prisma';
import { sendEmail, normalizeMailgunMessageId, fetchMailgunEvents } from './mailgun';
import { renderMom, type MomInput } from './meeting-mom';
import type { ActionItem, Decision, Risk, OpenQuestion } from './llm/types';

/**
 * MoM sender — orchestrates rendering, sending via Mailgun, and persistence
 * of MomDelivery records that we later poll for open/delivery status.
 *
 * One MomDelivery row is created per recipient. We send a SEPARATE Mailgun
 * message per recipient (not one message with multiple `to`s) so each gets
 * its own message-id — required for tracking opens at the recipient granularity.
 */

export type SendMomInput = {
  meetingNoteId: string;
  recipients: Array<{ email: string; name?: string | null }>;
  /** Override subject. Defaults to the auto-generated one from renderMom. */
  subjectOverride?: string;
};

export type SendMomResult = {
  delivered: Array<{ deliveryId: string; recipient: string; mailgunMessageId: string | null }>;
  failed: Array<{ recipient: string; error: string }>;
};

/**
 * Load a MeetingNote and assemble the MomInput payload the renderer expects.
 * Throws if the meeting isn't in `ready` status — we don't email half-baked
 * extractions.
 */
async function loadMomInput(meetingNoteId: string): Promise<MomInput> {
  const m = await prisma.meetingNote.findUnique({
    where: { id: meetingNoteId },
    include: {
      organizer: { select: { name: true, email: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
  if (!m) throw new Error(`MeetingNote ${meetingNoteId} not found`);
  if (m.status !== 'ready') {
    throw new Error(`MeetingNote ${meetingNoteId} not ready (status=${m.status})`);
  }

  return {
    meetingId: m.id,
    subject: m.subject,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    durationSec: m.durationSec,
    organizer: { name: m.organizer.name, email: m.organizer.email },
    project: { id: m.project.id, name: m.project.name, color: m.project.color },
    summary: m.summary,
    decisions: ((m.decisions ?? []) as unknown as Decision[]) ?? [],
    actionItems: ((m.actionItems ?? []) as unknown as ActionItem[]) ?? [],
    risks: ((m.risks ?? []) as unknown as Risk[]) ?? [],
    openQuestions: ((m.openQuestions ?? []) as unknown as OpenQuestion[]) ?? [],
  };
}

export async function sendMom(input: SendMomInput): Promise<SendMomResult> {
  const momInput = await loadMomInput(input.meetingNoteId);
  const rendered = renderMom(momInput);
  const subject = input.subjectOverride?.trim() || rendered.subject;

  const result: SendMomResult = { delivered: [], failed: [] };

  for (const r of input.recipients) {
    // Step 1: create a MomDelivery row up front so even mid-send failures
    // leave a trace the admin can see + retry.
    const delivery = await prisma.momDelivery.create({
      data: {
        meetingNoteId: input.meetingNoteId,
        recipientEmail: r.email.toLowerCase().trim(),
        recipientName: r.name ?? null,
        subject,
        status: 'queued',
      },
    });

    // Step 2: send via Mailgun with tracking enabled
    try {
      const mailgunResult = await sendEmail({
        to: r.name ? `${r.name} <${r.email}>` : r.email,
        subject,
        html: rendered.html,
        text: rendered.text,
        tracking: true,
      });

      const messageId = normalizeMailgunMessageId(mailgunResult.id);
      await prisma.momDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          mailgunMessageId: messageId,
        },
      });

      result.delivered.push({
        deliveryId: delivery.id,
        recipient: r.email,
        mailgunMessageId: messageId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.momDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage: msg,
        },
      });
      result.failed.push({ recipient: r.email, error: msg });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Poll Mailgun events to refresh open/delivery status for one meeting's
// pending deliveries.
// ─────────────────────────────────────────────────────────────────────────

export type RefreshResult = {
  refreshed: number;
  updates: Array<{
    recipient: string;
    previousStatus: string;
    newStatus: string;
    openCount: number;
  }>;
  errors: Array<{ recipient: string; error: string }>;
};

export async function refreshMomDeliveries(meetingNoteId: string): Promise<RefreshResult> {
  // Only poll deliveries that still have something to learn — once a recipient
  // has opened, we still increment openCount so keep polling those too. Skip
  // failed and never-sent (queued) ones.
  const deliveries = await prisma.momDelivery.findMany({
    where: {
      meetingNoteId,
      status: { in: ['sent', 'delivered', 'opened'] },
      mailgunMessageId: { not: null },
    },
  });

  const result: RefreshResult = { refreshed: 0, updates: [], errors: [] };

  for (const d of deliveries) {
    if (!d.mailgunMessageId) continue;
    try {
      const events = await fetchMailgunEvents({
        messageId: d.mailgunMessageId,
        events: ['delivered', 'opened', 'failed'],
        limit: 50,
      });

      // Filter for this recipient — Mailgun events are scoped by message-id
      // but we double-check the recipient match for safety.
      const myEvents = events.filter(
        (e) => e.recipient?.toLowerCase() === d.recipientEmail.toLowerCase(),
      );

      const opened = myEvents.filter((e) => e.event === 'opened');
      const delivered = myEvents.find((e) => e.event === 'delivered');
      const failed = myEvents.find((e) => e.event === 'failed');

      let newStatus = d.status;
      const data: Record<string, unknown> = { lastEventAt: new Date() };

      if (failed) {
        newStatus = 'failed';
        data.status = 'failed';
        data.errorMessage = JSON.stringify((failed as Record<string, unknown>).reason ?? failed).slice(0, 1000);
      } else if (opened.length > 0) {
        newStatus = 'opened';
        data.status = 'opened';
        const firstOpenTs = Math.min(...opened.map((e) => e.timestamp));
        const lastOpenTs = Math.max(...opened.map((e) => e.timestamp));
        if (!d.openedAt) data.openedAt = new Date(firstOpenTs * 1000);
        data.openCount = opened.length;
        data.lastOpenedAt = new Date(lastOpenTs * 1000);
        if (delivered && !d.deliveredAt) data.deliveredAt = new Date(delivered.timestamp * 1000);
      } else if (delivered) {
        newStatus = 'delivered';
        data.status = 'delivered';
        if (!d.deliveredAt) data.deliveredAt = new Date(delivered.timestamp * 1000);
      }

      if (Object.keys(data).length > 1) {
        // Always > 1 because lastEventAt is set; the meaningful update is when status changed.
        await prisma.momDelivery.update({ where: { id: d.id }, data });
        if (newStatus !== d.status || (data.openCount as number) > d.openCount) {
          result.updates.push({
            recipient: d.recipientEmail,
            previousStatus: d.status,
            newStatus,
            openCount: (data.openCount as number) ?? d.openCount,
          });
        }
        result.refreshed += 1;
      }
    } catch (err) {
      result.errors.push({
        recipient: d.recipientEmail,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
