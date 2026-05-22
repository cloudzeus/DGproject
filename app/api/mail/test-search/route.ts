import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { searchMessages } from '@/lib/graph-mail';
import { parseEmailTag } from '@/lib/email-tag';

// Diagnostic endpoint — verifies the mailbox OAuth handshake worked and the
// access token can hit Graph. Returns up to 20 messages matching ?q=... (or
// "FPM:p=" by default), with the parsed routing tag if present.
//
//   GET /api/mail/test-search             → search for "FPM:p="
//   GET /api/mail/test-search?q=invoice   → search for "invoice"
//
// Not for production — remove once the ingest UI is in place.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
  if (session.user.userType === 'customer') return new NextResponse('Forbidden', { status: 403 });

  const conn = await prisma.userMailConnection.findUnique({
    where: { userId: session.user.id },
    select: { scopes: true, expiresAt: true, createdAt: true },
  });
  if (!conn) {
    return NextResponse.json(
      { error: 'mailbox_not_connected', hint: 'Visit /profile and click "Σύνδεση mailbox".' },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? 'FPM:p=';

  try {
    const messages = await searchMessages(session.user.id, q, { top: 20 });
    const items = messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      subject: m.subject,
      from: m.from?.emailAddress?.address,
      to: m.toRecipients?.map((r) => r.emailAddress.address),
      receivedAt: m.receivedDateTime,
      preview: m.bodyPreview?.slice(0, 200),
      // Parsing the subject (and falling back to the preview) tells us which
      // project code + task this email would route to if ingested.
      tag: parseEmailTag(m.subject) ?? parseEmailTag(m.bodyPreview),
    }));
    return NextResponse.json({
      query: q,
      count: items.length,
      connection: {
        connectedAt: conn.createdAt,
        accessTokenExpiresAt: conn.expiresAt,
        scopes: conn.scopes,
      },
      messages: items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'graph_call_failed', message }, { status: 500 });
  }
}
