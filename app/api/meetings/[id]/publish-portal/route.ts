import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { notifyCustomerMomPublished } from '@/lib/notifications/customer';

/**
 * POST /api/meetings/:id/publish-portal   — δημοσίευση πρακτικών στο portal
 * DELETE /api/meetings/:id/publish-portal — απόσυρση
 *
 * Body (POST):
 *   { "include": { summary, decisionIndexes, actionItemIndexes, riskIndexes, openQuestionIndexes } }
 *
 * ΓΙΑΤΙ ΧΩΡΙΣΤΟ ENDPOINT ΑΠΟ ΤΟ send-mom: η αποστολή email σε έναν άνθρωπο δεν
 * είναι το ίδιο με τη δημοσίευση σε portal που παραμένει και διαβάζεται από
 * ΟΛΟΥΣ τους χρήστες της εταιρίας για πάντα. Αν η αποστολή δημοσίευε σιωπηλά,
 * κάθε MoM προς έναν παραλήπτη θα άνοιγε πρόσβαση σε όλη την εταιρία του.
 *
 * Το `include` αποθηκεύεται ΑΥΤΟΥΣΙΟ. Το portal το ξαναπερνά από το ίδιο
 * `applyFilter()` που φτιάχνει το email, οπότε ό,τι δεν τσεκαρίστηκε δεν φεύγει
 * ποτέ από τον server.
 */

type IncludeFilter = {
  summary?: boolean;
  decisionIndexes?: number[];
  actionItemIndexes?: number[];
  riskIndexes?: number[];
  openQuestionIndexes?: number[];
};

/** Μόνο η ομάδα δημοσιεύει. Πελάτης που θα καλούσε το endpoint δεν έχει τι να πετύχει. */
async function requireStaff(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  if (session.user.userType === 'customer') throw new Error('Forbidden');
  return session.user.id;
}

function sanitizeIndexes(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let actorId: string;
  try {
    actorId = await requireStaff();
  } catch (e) {
    const forbidden = e instanceof Error && e.message === 'Forbidden';
    return NextResponse.json(
      { error: forbidden ? 'Μόνο η ομάδα δημοσιεύει πρακτικά.' : 'Unauthorized' },
      { status: forbidden ? 403 : 401 },
    );
  }

  const meeting = await prisma.meetingNote.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!meeting) return NextResponse.json({ error: 'Δεν βρέθηκε η σύσκεψη.' }, { status: 404 });

  // Πρακτικά που δεν έχουν περάσει από επεξεργασία δεν έχουν περιεχόμενο να
  // δημοσιευτεί — η δημοσίευση θα έδειχνε στον πελάτη μια κενή σελίδα.
  if (meeting.status !== 'ready') {
    return NextResponse.json(
      { error: 'Τα πρακτικά δεν έχουν ολοκληρωθεί ακόμα.' },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { include?: IncludeFilter };
  const raw = body.include ?? {};

  const include: IncludeFilter = {
    summary: raw.summary !== false,
    decisionIndexes: sanitizeIndexes(raw.decisionIndexes),
    actionItemIndexes: sanitizeIndexes(raw.actionItemIndexes),
    riskIndexes: sanitizeIndexes(raw.riskIndexes),
    openQuestionIndexes: sanitizeIndexes(raw.openQuestionIndexes),
  };

  await prisma.meetingNote.update({
    where: { id },
    data: {
      momVisibility: 'shared',
      momSharedInclude: include,
      momSharedById: actorId,
      momSharedAt: new Date(),
    },
  });

  await notifyCustomerMomPublished(id);

  return NextResponse.json({ ok: true, momVisibility: 'shared', include });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    await requireStaff();
  } catch (e) {
    const forbidden = e instanceof Error && e.message === 'Forbidden';
    return NextResponse.json(
      { error: forbidden ? 'Μόνο η ομάδα αποσύρει πρακτικά.' : 'Unauthorized' },
      { status: forbidden ? 403 : 401 },
    );
  }

  // Το `momSharedInclude` ΔΕΝ σβήνεται: αν τα πρακτικά ξαναδημοσιευτούν, η
  // προηγούμενη επιμέλεια είναι το σωστό σημείο εκκίνησης. Η ορατότητα είναι
  // αυτή που κλείνει την πόρτα.
  await prisma.meetingNote.update({
    where: { id },
    data: { momVisibility: 'internal', momSharedAt: null },
  });

  return NextResponse.json({ ok: true, momVisibility: 'internal' });
}
