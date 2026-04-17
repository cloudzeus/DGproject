'use server';

import { revalidatePath } from 'next/cache';
import bcryptjs from 'bcryptjs';
import { auth, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN } from '@/lib/bunnycdn';

const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function signOutAction() {
  await signOut({ redirectTo: '/auth/signin' });
}

export type ProfileUpdateState = { ok: boolean; error?: string; message?: string };

export async function updateProfile(
  _prev: ProfileUpdateState,
  formData: FormData,
): Promise<ProfileUpdateState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Δεν είστε συνδεδεμένος.' };

  const name = String(formData.get('name') ?? '').trim();
  const removeAvatar = formData.get('removeAvatar') === '1';
  const avatarFile = formData.get('avatarFile');
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');

  if (name.length < 2) return { ok: false, error: 'Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες.' };

  const data: { name: string; image?: string | null; password?: string } = { name };

  if (avatarFile instanceof File && avatarFile.size > 0) {
    if (!ALLOWED_AVATAR_TYPES.includes(avatarFile.type)) {
      return { ok: false, error: 'Μη υποστηριζόμενος τύπος εικόνας. Επιτρέπονται PNG, JPG, WEBP, GIF.' };
    }
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: 'Το αρχείο υπερβαίνει τα 5MB.' };
    }
    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    const ext = avatarFile.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `${session.user.id}-${Date.now()}.${ext}`;
    try {
      const uploaded = await uploadFileToCDN({
        file: buffer,
        filename,
        folder: 'avatars',
        contentType: avatarFile.type,
      });
      data.image = uploaded.url;
    } catch {
      return { ok: false, error: 'Αποτυχία μεταφόρτωσης εικόνας στο CDN.' };
    }
  } else if (removeAvatar) {
    data.image = null;
  }

  if (newPassword) {
    if (newPassword.length < 8) return { ok: false, error: 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' };
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
    if (dbUser?.password) {
      if (!currentPassword) return { ok: false, error: 'Απαιτείται ο τρέχων κωδικός.' };
      const ok = await bcryptjs.compare(currentPassword, dbUser.password);
      if (!ok) return { ok: false, error: 'Λάθος τρέχων κωδικός.' };
    }
    data.password = await bcryptjs.hash(newPassword, 10);
  }

  await prisma.user.update({ where: { id: session.user.id }, data });

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Το προφίλ ενημερώθηκε.' };
}
