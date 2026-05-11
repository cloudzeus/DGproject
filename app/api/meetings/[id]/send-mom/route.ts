import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sendMom } from '@/lib/mom-sender';

/**
 * POST /api/meetings/:id/send-mom
 *
 * Body:
 *   {
 *     "recipients": [{ "email": "x@y.com", "name": "Optional" }, …],
 *     "subjectOverride": "optional"
 *   }
 *
 * Sends one Mailgun message per recipient (tracking enabled) and persists a
 * MomDelivery row per recipient. The response includes delivery ids the UI
 * uses to render a tracking table.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: meetingNoteId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as {
    recipients?: Array<{ email?: string; name?: string }>;
    subjectOverride?: string;
    include?: {
      summary?: boolean;
      decisionIndexes?: number[];
      actionItemIndexes?: number[];
      riskIndexes?: number[];
      openQuestionIndexes?: number[];
    };
  };

  const recipients = (body.recipients ?? [])
    .map((r) => ({
      email: String(r.email ?? '').trim(),
      name: r.name ? String(r.name).trim() : null,
    }))
    .filter((r) => r.email.includes('@'));

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'At least one valid recipient is required' }, { status: 400 });
  }

  try {
    const result = await sendMom({
      meetingNoteId,
      recipients,
      subjectOverride: body.subjectOverride,
      include: body.include,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[send-mom] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
