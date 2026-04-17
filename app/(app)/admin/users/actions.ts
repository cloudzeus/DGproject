'use server';

import { revalidatePath } from 'next/cache';
import bcryptjs from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type Role = 'admin' | 'manager' | 'member' | 'viewer';
const ROLES: Role[] = ['admin', 'manager', 'member', 'viewer'];

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
