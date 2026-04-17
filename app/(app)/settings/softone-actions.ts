'use server';

import { auth } from '@/auth';
import { testSoftOneConnection, clearSoftOneSession, type SoftOneStatus } from '@/lib/softone';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') throw new Error('Unauthorized');
}

export async function testSoftOne(): Promise<SoftOneStatus> {
  await requireAdmin();
  return testSoftOneConnection();
}

export async function resetSoftOneSession(): Promise<SoftOneStatus> {
  await requireAdmin();
  clearSoftOneSession();
  return testSoftOneConnection();
}
