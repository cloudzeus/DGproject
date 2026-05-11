import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { syncUserToSoftOne } from '@/lib/softone-contacts';

/**
 * POST /api/admin/users/:id/sync-softone
 *
 * Pushes a User to SoftOne. Dispatch by userType:
 *   - customer  → CUSTOMER object (setData)
 *   - supplier  → SUPPLIER object (setData)
 *   - employee  → links to existing USERS row (no insert)
 *
 * Admin-only. Returns the SoftOne primary key on success.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  const result = await syncUserToSoftOne(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
