'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

export async function createDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const color = String(formData.get('color') ?? '#0078D4').trim();

  if (name.length < 2) return { ok: false, error: 'Το όνομα είναι πολύ σύντομο.' };

  const existing = await prisma.department.findUnique({ where: { name } });
  if (existing) return { ok: false, error: 'Υπάρχει ήδη τμήμα με αυτό το όνομα.' };

  await prisma.department.create({ data: { name, description, color } });
  revalidatePath('/admin/departments');
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function updateDepartment(id: string, formData: FormData) {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const color = String(formData.get('color') ?? '#0078D4').trim();

  if (name.length < 2) return { ok: false, error: 'Το όνομα είναι πολύ σύντομο.' };

  const clash = await prisma.department.findFirst({ where: { name, NOT: { id } } });
  if (clash) return { ok: false, error: 'Υπάρχει ήδη τμήμα με αυτό το όνομα.' };

  await prisma.department.update({ where: { id }, data: { name, description, color } });
  revalidatePath('/admin/departments');
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function deleteDepartment(id: string) {
  await requireAdmin();
  await prisma.department.delete({ where: { id } });
  revalidatePath('/admin/departments');
  revalidatePath('/admin/users');
  return { ok: true };
}
