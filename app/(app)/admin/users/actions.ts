'use server';

import { revalidatePath } from 'next/cache';
import bcryptjs from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileToCDN } from '@/lib/bunnycdn';
import { getUserPhoto, graphIsConfigured, GraphError } from '@/lib/microsoft-graph';

type Role = 'admin' | 'manager' | 'member' | 'viewer';
const ROLES: Role[] = ['admin', 'manager', 'member', 'viewer'];

const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

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

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return session.user.id;
}

function parseDepartmentIds(formData: FormData): string[] {
  return formData.getAll('departmentIds').map((v) => String(v)).filter(Boolean);
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const role = (String(formData.get('role') ?? 'member') as Role);
  const departmentIds = parseDepartmentIds(formData);

  if (name.length < 2) return { ok: false, error: 'Το όνομα είναι πολύ σύντομο.' };
  if (!email.includes('@')) return { ok: false, error: 'Μη έγκυρο email.' };
  if (password.length < 8) return { ok: false, error: 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' };
  if (!ROLES.includes(role)) return { ok: false, error: 'Μη έγκυρος ρόλος.' };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: 'Υπάρχει ήδη χρήστης με αυτό το email.' };

  const hashed = await bcryptjs.hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      departments: departmentIds.length
        ? { create: departmentIds.map((departmentId) => ({ departmentId })) }
        : undefined,
    },
  });

  revalidatePath('/admin/users');
  return { ok: true };
}

export async function updateUser(id: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? 'member') as Role;
  const newPassword = String(formData.get('newPassword') ?? '');
  const departmentIds = parseDepartmentIds(formData);

  if (name.length < 2) return { ok: false, error: 'Το όνομα είναι πολύ σύντομο.' };
  if (!email.includes('@')) return { ok: false, error: 'Μη έγκυρο email.' };
  if (!ROLES.includes(role)) return { ok: false, error: 'Μη έγκυρος ρόλος.' };

  const clash = await prisma.user.findFirst({ where: { email, NOT: { id } } });
  if (clash) return { ok: false, error: 'Υπάρχει ήδη άλλος χρήστης με αυτό το email.' };

  const data: { name: string; email: string; role: Role; password?: string } = { name, email, role };
  if (newPassword) {
    if (newPassword.length < 8) return { ok: false, error: 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' };
    data.password = await bcryptjs.hash(newPassword, 10);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data }),
    prisma.userDepartment.deleteMany({ where: { userId: id } }),
    ...(departmentIds.length
      ? [
          prisma.userDepartment.createMany({
            data: departmentIds.map((departmentId) => ({ userId: id, departmentId })),
          }),
        ]
      : []),
  ]);

  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteUser(id: string) {
  const actorId = await requireAdmin();
  if (id === actorId) return { ok: false, error: 'Δεν μπορείτε να διαγράψετε τον εαυτό σας.' };
  await prisma.user.delete({ where: { id } });
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function uploadUserAvatar(userId: string, formData: FormData) {
  await requireAdmin();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Δεν επιλέχθηκε αρχείο.' };
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return { ok: false, error: 'Μη υποστηριζόμενος τύπος εικόνας.' };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: 'Το αρχείο υπερβαίνει τα 5MB.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filename = `${userId}-${Date.now()}.${ext}`;

  try {
    const uploaded = await uploadFileToCDN({
      file: buffer,
      filename,
      folder: 'avatars',
      contentType: file.type,
    });
    await prisma.user.update({ where: { id: userId }, data: { image: uploaded.url } });
  } catch (e) {
    return { ok: false, error: describeCdnError(e) };
  }

  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function removeUserAvatar(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { image: null } });
  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function syncUserAvatarFromMicrosoft(userId: string) {
  await requireAdmin();
  if (!graphIsConfigured()) {
    return { ok: false, error: 'Το Microsoft integration δεν έχει ρυθμιστεί.' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { azureAdId: true },
  });
  if (!user?.azureAdId) {
    return { ok: false, error: 'Ο χρήστης δεν είναι συνδεδεμένος με Microsoft 365.' };
  }

  let photo;
  try {
    photo = await getUserPhoto(user.azureAdId);
  } catch (e) {
    return { ok: false, error: e instanceof GraphError ? e.message : 'Graph error.' };
  }
  if (!photo) return { ok: false, error: 'Δεν βρέθηκε φωτογραφία στο Microsoft προφίλ.' };

  const ext = photo.contentType.includes('png') ? 'png' : 'jpg';
  try {
    const uploaded = await uploadFileToCDN({
      file: photo.buffer,
      filename: `${userId}-ms-${Date.now()}.${ext}`,
      folder: 'avatars',
      contentType: photo.contentType,
    });
    await prisma.user.update({ where: { id: userId }, data: { image: uploaded.url } });
  } catch (e) {
    return { ok: false, error: describeCdnError(e) };
  }

  revalidatePath('/admin/users');
  revalidatePath('/', 'layout');
  return { ok: true };
}
