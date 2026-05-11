import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { softoneLookup, type SoftOneLookupSource } from '@/lib/softone-lookup';

/**
 * GET /api/softone/lookup?source=customer|supplier|company&q=<free text>&limit=25
 *
 * Returns matching SoftOne records for the company combobox in the user form.
 * Admin/manager only because the search hits the live ERP.
 *
 * Free-text matching:
 *   - 9 digits → AFM exact
 *   - any digits → CODE exact
 *   - text     → NAME prefix (SoftOne wildcard `*`)
 */
const VALID_SOURCES: SoftOneLookupSource[] = ['customer', 'supplier', 'company'];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Admin or manager role required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const source = url.searchParams.get('source') as SoftOneLookupSource | null;
  const q = url.searchParams.get('q') ?? '';
  const limit = Number(url.searchParams.get('limit') ?? 25);

  if (!source || !VALID_SOURCES.includes(source)) {
    return NextResponse.json(
      { error: `source must be one of: ${VALID_SOURCES.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const results = await softoneLookup({ source, q, limit });
    return NextResponse.json({ source, q, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
