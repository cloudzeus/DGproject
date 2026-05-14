'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * Project costing actions. All gated to admin/manager — viewers (clients) and
 * regular members never reach these paths because the Κοστολόγηση tab itself
 * is hidden for them in the UI, but we re-check here defensively in case the
 * UI gate is bypassed.
 */

async function requirePrivileged() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = session.user.role;
  if (role !== 'admin' && role !== 'manager') throw new Error('Forbidden');
  return { userId: session.user.id };
}

/**
 * Adds a single cost line. Reads the current SoftOne price + VAT rate as the
 * snapshot, so future SoftOne price changes don't retroactively shift project
 * cost. The caller can override `quantity` and `unitPriceOverride`.
 */
export async function addCostLine(
  projectId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { userId } = await requirePrivileged();

  const softoneItemMtrl = Number(formData.get('softoneItemMtrl'));
  const quantity = Number(formData.get('quantity') ?? 1);
  const unitPriceOverrideRaw = formData.get('unitPriceOverride');
  const notes = String(formData.get('notes') ?? '').trim() || null;

  if (!Number.isFinite(softoneItemMtrl) || softoneItemMtrl <= 0) {
    return { ok: false, error: 'Μη έγκυρο είδος.' };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: 'Η ποσότητα πρέπει να είναι θετικός αριθμός.' };
  }

  const item = await prisma.softoneItem.findUnique({
    where: { mtrl: softoneItemMtrl },
    select: { mtrl: true, kind: true, unitPrice: true, vatRate: true, isActive: true },
  });
  if (!item) return { ok: false, error: 'Το είδος δεν βρέθηκε στον κατάλογο.' };
  if (!item.isActive) {
    return { ok: false, error: 'Το είδος είναι ανενεργό. Κάνε πρώτα sync ή επίλεξε ενεργό είδος.' };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { ok: false, error: 'Το έργο δεν βρέθηκε.' };

  const unitPriceSnapshot =
    unitPriceOverrideRaw !== null && unitPriceOverrideRaw !== ''
      ? Number(unitPriceOverrideRaw)
      : item.unitPrice;
  if (!Number.isFinite(unitPriceSnapshot) || unitPriceSnapshot < 0) {
    return { ok: false, error: 'Μη έγκυρη τιμή μονάδας.' };
  }

  const created = await prisma.projectCostLine.create({
    data: {
      projectId,
      softoneItemMtrl: item.mtrl,
      kind: item.kind,
      quantity,
      unitPriceSnapshot,
      vatRateSnapshot: item.vatRate,
      notes,
      createdById: userId,
    },
    select: { id: true },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, id: created.id };
}

/**
 * Batch-add multiple cost lines at once (used by the picker "Add selected"
 * button). Returns per-item errors but always continues; the UI shows a
 * summary of how many succeeded.
 */
export async function addCostLines(
  projectId: string,
  lines: Array<{ softoneItemMtrl: number; quantity: number; unitPriceOverride?: number | null; notes?: string | null }>,
): Promise<{ ok: boolean; added: number; errors: string[] }> {
  const { userId } = await requirePrivileged();

  if (lines.length === 0) return { ok: true, added: 0, errors: [] };

  // Pull every referenced item in one query to validate + snapshot prices.
  const mtrls = Array.from(new Set(lines.map((l) => l.softoneItemMtrl)));
  const items = await prisma.softoneItem.findMany({
    where: { mtrl: { in: mtrls } },
    select: { mtrl: true, kind: true, unitPrice: true, vatRate: true, isActive: true },
  });
  const itemByMtrl = new Map(items.map((i) => [i.mtrl, i]));

  const errors: string[] = [];
  const valid: Array<{
    softoneItemMtrl: number;
    kind: 'product' | 'service';
    quantity: number;
    unitPriceSnapshot: number;
    vatRateSnapshot: number | null;
    notes: string | null;
  }> = [];

  for (const line of lines) {
    const item = itemByMtrl.get(line.softoneItemMtrl);
    if (!item) {
      errors.push(`MTRL ${line.softoneItemMtrl}: δεν βρέθηκε στον κατάλογο`);
      continue;
    }
    if (!item.isActive) {
      errors.push(`MTRL ${line.softoneItemMtrl}: ανενεργό είδος`);
      continue;
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      errors.push(`MTRL ${line.softoneItemMtrl}: μη έγκυρη ποσότητα`);
      continue;
    }
    const price =
      line.unitPriceOverride != null && Number.isFinite(line.unitPriceOverride)
        ? line.unitPriceOverride
        : item.unitPrice;
    if (price < 0) {
      errors.push(`MTRL ${line.softoneItemMtrl}: αρνητική τιμή`);
      continue;
    }
    valid.push({
      softoneItemMtrl: item.mtrl,
      kind: item.kind,
      quantity: line.quantity,
      unitPriceSnapshot: price,
      vatRateSnapshot: item.vatRate,
      notes: line.notes ?? null,
    });
  }

  if (valid.length === 0) {
    return { ok: false, added: 0, errors };
  }

  await prisma.projectCostLine.createMany({
    data: valid.map((v) => ({
      projectId,
      softoneItemMtrl: v.softoneItemMtrl,
      kind: v.kind,
      quantity: v.quantity,
      unitPriceSnapshot: v.unitPriceSnapshot,
      vatRateSnapshot: v.vatRateSnapshot,
      notes: v.notes,
      createdById: userId,
    })),
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, added: valid.length, errors };
}

export async function updateCostLine(
  projectId: string,
  lineId: string,
  patch: {
    quantity?: number;
    unitPriceSnapshot?: number;
    vatRateSnapshot?: number | null;
    notes?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  await requirePrivileged();

  const existing = await prisma.projectCostLine.findUnique({
    where: { id: lineId },
    select: { projectId: true },
  });
  if (!existing) return { ok: false, error: 'Η γραμμή δεν βρέθηκε.' };
  if (existing.projectId !== projectId) return { ok: false, error: 'Forbidden.' };

  const data: {
    quantity?: number;
    unitPriceSnapshot?: number;
    vatRateSnapshot?: number | null;
    notes?: string | null;
  } = {};
  if (patch.quantity !== undefined) {
    if (!Number.isFinite(patch.quantity) || patch.quantity <= 0) {
      return { ok: false, error: 'Μη έγκυρη ποσότητα.' };
    }
    data.quantity = patch.quantity;
  }
  if (patch.unitPriceSnapshot !== undefined) {
    if (!Number.isFinite(patch.unitPriceSnapshot) || patch.unitPriceSnapshot < 0) {
      return { ok: false, error: 'Μη έγκυρη τιμή.' };
    }
    data.unitPriceSnapshot = patch.unitPriceSnapshot;
  }
  if (patch.vatRateSnapshot !== undefined) {
    data.vatRateSnapshot = patch.vatRateSnapshot;
  }
  if (patch.notes !== undefined) {
    data.notes = patch.notes;
  }

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.projectCostLine.update({ where: { id: lineId }, data });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteCostLine(
  projectId: string,
  lineId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requirePrivileged();

  const existing = await prisma.projectCostLine.findUnique({
    where: { id: lineId },
    select: { projectId: true },
  });
  if (!existing) return { ok: false, error: 'Η γραμμή δεν βρέθηκε.' };
  if (existing.projectId !== projectId) return { ok: false, error: 'Forbidden.' };

  await prisma.projectCostLine.delete({ where: { id: lineId } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
