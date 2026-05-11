import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { syncProjectToSoftOne } from '@/lib/softone-contacts';

/**
 * POST /api/projects/:id/sync-softone
 *
 * Pushes a Project to SoftOne PRJC. Creates if no softoneId set, otherwise updates.
 * If the project has a customerUserId pointing to a customer-type User, that user's
 * softoneCustomerId is wired into PRJC.TRDR.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Only admins and managers can push to the ERP.
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Admin or manager role required' }, { status: 403 });
  }

  const result = await syncProjectToSoftOne(projectId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
