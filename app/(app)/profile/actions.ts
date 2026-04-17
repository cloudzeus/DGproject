'use server';

import { revalidatePath } from 'next/cache';
import bcryptjs from 'bcryptjs';
import { auth, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN } from '@/lib/bunnycdn';
import { getUserPhoto, graphIsConfigured, GraphError } from '@/lib/microsoft-graph';

const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function signOutAction() {
  await signOut({ redirectTo: '/auth/signin' });
}

export type ProfileUpdateState = { ok: boolean; error?: string; message?: string };

function describeCdnError(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { response?: { status?: number; statusText?: string }; message?: string };
    if (anyE.response?.status) {
      return `Αποτυχία CDN (${anyE.response.status} ${anyE.response.statusText ?? ''}). Ελέγξτε τις μεταβλητές BUNNY_*.`;
    }
    if (anyE.message) return `Αποτυχία CDN: ${anyE.message}`;
  }
  return 'Αποτυχία μεταφόρτωσης εικόνας στο CDN.';
}

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
    } catch (e) {
      return { ok: false, error: describeCdnError(e) };
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

export async function syncMyPhotoFromMicrosoft(): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Δεν είστε συνδεδεμένος.' };
  if (!graphIsConfigured()) return { ok: false, error: 'Το Microsoft integration δεν έχει ρυθμιστεί.' };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { azureAdId: true, email: true },
  });
  if (!user?.azureAdId) {
    return { ok: false, error: 'Ο λογαριασμός σου δεν είναι συνδεδεμένος με Microsoft 365.' };
  }

  let photo;
  try {
    photo = await getUserPhoto(user.azureAdId);
  } catch (e) {
    return { ok: false, error: e instanceof GraphError ? e.message : 'Graph error.' };
  }
  if (!photo) return { ok: false, error: 'Δεν βρέθηκε φωτογραφία στο Microsoft προφίλ σου.' };

  const ext = photo.contentType.includes('png') ? 'png' : 'jpg';
  try {
    const uploaded = await uploadFileToCDN({
      file: photo.buffer,
      filename: `${session.user.id}-ms-${Date.now()}.${ext}`,
      folder: 'avatars',
      contentType: photo.contentType,
    });
    await prisma.user.update({ where: { id: session.user.id }, data: { image: uploaded.url } });
  } catch (e) {
    return { ok: false, error: describeCdnError(e) };
  }

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  return { ok: true };
}
