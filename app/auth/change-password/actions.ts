'use server';

import bcryptjs from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const MIN_LENGTH = 8;

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changePasswordOnFirstLogin(
  formData: FormData,
): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Δεν έχεις συνδεθεί.' };

  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (newPassword.length < MIN_LENGTH) {
    return { ok: false, error: `Ο νέος κωδικός πρέπει να έχει τουλάχιστον ${MIN_LENGTH} χαρακτήρες.` };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'Οι κωδικοί δεν ταιριάζουν.' };
  }
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return { ok: false, error: 'Ο κωδικός πρέπει να περιέχει γράμματα και αριθμούς.' };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: 'Ο νέος κωδικός πρέπει να διαφέρει από τον προσωρινό.' };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  });
  if (!user || !user.password) {
    return { ok: false, error: 'Ο λογαριασμός δεν επιτρέπει αλλαγή κωδικού.' };
  }

  const ok = await bcryptjs.compare(currentPassword, user.password);
  if (!ok) {
    return { ok: false, error: 'Λάθος προσωρινός κωδικός.' };
  }

  const hashed = await bcryptjs.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false },
  });

  return { ok: true };
}
