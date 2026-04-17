'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createCalendarEvent, graphIsConfigured, type TaskCalendarEvent } from '@/lib/microsoft-graph';

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createMyCalendarEvent(formData: FormData) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return { ok: false, error: 'Unauthorized' };

  if (!graphIsConfigured()) {
    return { ok: false, error: 'Το Microsoft integration δεν έχει ρυθμιστεί.' };
  }

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { email: true, azureAdId: true },
  });
  if (!user) return { ok: false, error: 'Ο χρήστης δεν βρέθηκε.' };

  const userKey = user.azureAdId ?? user.email;
  if (!userKey) {
    return { ok: false, error: 'Ο λογαριασμός σου δεν είναι συνδεδεμένος με Microsoft 365.' };
  }

  const subject = String(formData.get('subject') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  const isAllDay = String(formData.get('isAllDay') ?? '') === 'on';
  const startRaw = String(formData.get('start') ?? '');
  const endRaw = String(formData.get('end') ?? '');

  if (subject.length < 2) return { ok: false, error: 'Ο τίτλος είναι πολύ σύντομος.' };

  const startDate = parseDate(startRaw);
  if (!startDate) return { ok: false, error: 'Μη έγκυρη ημερομηνία έναρξης.' };

  let endDate = parseDate(endRaw);
  if (!endDate) {
    endDate = new Date(startDate);
    if (isAllDay) endDate.setDate(endDate.getDate() + 1);
    else endDate.setHours(endDate.getHours() + 1);
  }

  if (endDate.getTime() <= startDate.getTime()) {
    return { ok: false, error: 'Η λήξη πρέπει να είναι μετά την έναρξη.' };
  }

  const bodyHtml = description
    ? `<p>${description.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</p>`
    : '';

  const event: TaskCalendarEvent = {
    subject,
    bodyHtml: location ? `${bodyHtml}<p><strong>Τοποθεσία:</strong> ${location}</p>` : bodyHtml,
    startDate,
    endDate,
    isAllDay,
    attendees: [],
    categories: ['A-Sisyphus'],
  };

  try {
    await createCalendarEvent(userKey, event);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Graph error' };
  }

  revalidatePath('/calendar');
  return { ok: true };
}
