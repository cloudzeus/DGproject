'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { syncSoftoneItems, type SyncResult } from '@/lib/softone-items-sync';

/**
 * Triggers a manual SoftOne ITEM catalog sync. Admin/manager only.
 *
 * Returns the sync result so the UI can show counts + errors inline. The cron
 * endpoint (`/api/cron/softone-items-sync`) calls `syncSoftoneItems()` directly
 * without this server-action wrapper.
 */
export async function manualSyncSoftoneItems(): Promise<SyncResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      totalSeen: 0,
      upserted: 0,
      deactivated: 0,
      errors: ['Unauthorized'],
      durationMs: 0,
    };
  }
  const role = session.user.role;
  if (role !== 'admin' && role !== 'manager') {
    return {
      ok: false,
      totalSeen: 0,
      upserted: 0,
      deactivated: 0,
      errors: ['Forbidden: μόνο admin/manager μπορεί να κάνει sync.'],
      durationMs: 0,
    };
  }

  const result = await syncSoftoneItems();
  revalidatePath('/catalog/products');
  revalidatePath('/catalog/services');
  return result;
}
