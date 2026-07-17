/**
 * Backfill task start/due times for tasks that were given a DATE but no TIME.
 *
 * Rule (mirrors task creation): when a task has a date but no specific time, the
 * system should place it in business hours (09:00–18:30) at the next AVAILABLE
 * slot for its creator/assignees, with a minimum duration of 1h (or its
 * estimatedHours), and sync it to the assignee/creator calendar.
 *
 * DEFAULT = DRY RUN (reports only, writes nothing). Pass `--apply` to persist.
 * Pass `--calendar` (with --apply) to also re-sync affected tasks to Outlook.
 *
 * Run:  npx ts-node scripts/backfill-task-dates.ts            # dry run
 *       npx ts-node scripts/backfill-task-dates.ts --apply
 *       npx ts-node scripts/backfill-task-dates.ts --apply --calendar
 *
 * Server timezone is Europe/Athens, so getHours()/setHours() are local business
 * time — matching lib/business-hours.ts and the create-time auto-slot logic.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  BUSINESS_START_HOUR,
  BUSINESS_START_MINUTE,
  BUSINESS_END_HOUR,
  BUSINESS_END_MINUTE,
  normalizeToBusinessHours,
  hasTimeComponent,
} from '../lib/business-hours';

// Load DATABASE_URL etc. from .env(.local) before constructing the client.
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const CALENDAR = process.argv.includes('--calendar');

function fmt(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false });
}

/**
 * Next free business-hours slot on `targetDay` for the given users: 09:00, or
 * right after the latest same-day task (by dueDate) already scheduled for any of
 * them. Duration = max(durationHours, 1) hours. Mirrors computeAutoSlotForCreator.
 */
async function computeSlot(
  userIds: string[],
  targetDay: Date,
  durationHours: number,
  excludeTaskId: string,
): Promise<{ startDate: Date; dueDate: Date }> {
  const dayStart = new Date(targetDay);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const uids = Array.from(new Set(userIds.filter(Boolean)));

  const sameDayTasks = await prisma.task.findMany({
    where: {
      id: { not: excludeTaskId },
      startDate: { gte: dayStart, lt: dayEnd },
      dueDate: { not: null },
      OR: [
        { createdById: { in: uids } },
        { assignees: { some: { userId: { in: uids } } } },
      ],
    },
    select: { dueDate: true },
  });

  const baseline = new Date(dayStart);
  baseline.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0);
  let earliestStart = baseline.getTime();
  for (const t of sameDayTasks) {
    if (t.dueDate && t.dueDate.getTime() > earliestStart) earliestStart = t.dueDate.getTime();
  }

  const startNormalized = normalizeToBusinessHours(new Date(earliestStart));
  const durationMs = Math.max(durationHours, 1) * 60 * 60 * 1000;
  const dueDate = new Date(startNormalized.getTime() + durationMs);
  return { startDate: startNormalized, dueDate };
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function atBusinessStart(day: Date): Date {
  const d = new Date(day);
  d.setHours(BUSINESS_START_HOUR, BUSINESS_START_MINUTE, 0, 0);
  return d;
}
function atBusinessEnd(day: Date): Date {
  const d = new Date(day);
  d.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0);
  return d;
}

/**
 * Decide the corrected start/due for a no-time task.
 * - Multi-day (start & due on different days): PRESERVE the span — 09:00 on the
 *   start day → 18:30 on the due day. Never re-slot or shift a deliberate range.
 * - Single-day / single-date: auto-slot into the next free business slot with a
 *   1h minimum (or estimatedHours), matching task-creation behavior.
 */
async function correctedSlot(
  start: Date | null,
  due: Date | null,
  userIds: string[],
  durationHours: number,
  excludeTaskId: string,
): Promise<{ startDate: Date; dueDate: Date }> {
  if (start && due && !sameLocalDay(start, due)) {
    return { startDate: atBusinessStart(start), dueDate: atBusinessEnd(due) };
  }
  const anchor = (due ?? start)!;
  return computeSlot(userIds, anchor, durationHours, excludeTaskId);
}

async function main() {
  console.log(`\n=== Task date/time backfill — ${APPLY ? 'APPLY' : 'DRY RUN'} ===\n`);

  const tasks = await prisma.task.findMany({
    where: {
      project: { status: { not: 'archived' } },
      OR: [{ startDate: { not: null } }, { dueDate: { not: null } }],
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      dueDate: true,
      estimatedHours: true,
      createdById: true,
      addToCalendar: true,
      outlookEventId: true,
      project: { select: { name: true } },
      assignees: { select: { userId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // A task "needs a time" when it has a date anchor but NO time-of-day was set,
  // i.e. the anchor (dueDate preferred, else startDate) sits at local midnight.
  const needsFix = tasks.filter((t) => {
    const anchor = t.dueDate ?? t.startDate;
    return anchor != null && !hasTimeComponent(anchor);
  });

  console.log(`Scanned ${tasks.length} dated tasks in active projects.`);
  console.log(`→ ${needsFix.length} have a date but no time (midnight) and will be scheduled.\n`);

  let calendarCandidates = 0;
  const preview: string[] = [];

  for (const t of needsFix) {
    const durationHours = t.estimatedHours && t.estimatedHours > 0 ? t.estimatedHours : 1;
    const userIds = [t.createdById, ...t.assignees.map((a) => a.userId)];
    const slot = await correctedSlot(t.startDate, t.dueDate, userIds, durationHours, t.id);

    if (t.addToCalendar) calendarCandidates++;

    if (preview.length < 25) {
      preview.push(
        `  • [${t.project.name}] ${t.title}\n` +
          `      start ${fmt(t.startDate)} → ${fmt(slot.startDate)}\n` +
          `      due   ${fmt(t.dueDate)} → ${fmt(slot.dueDate)}` +
          (t.addToCalendar ? '   (calendar)' : ''),
      );
    }

    if (APPLY) {
      await prisma.task.update({
        where: { id: t.id },
        data: { startDate: slot.startDate, dueDate: slot.dueDate },
      });
    }
  }

  console.log(preview.join('\n'));
  if (needsFix.length > 25) console.log(`  … and ${needsFix.length - 25} more`);

  console.log(`\n${calendarCandidates} of these have addToCalendar=true.`);

  if (APPLY && CALENDAR) {
    console.log('\nRe-syncing calendars for affected tasks…');
    // Imported lazily so the dry run never touches Outlook.
    const { syncTaskCalendar } = await import('../lib/task-calendar-sync');
    let ok = 0;
    let failed = 0;
    for (const t of needsFix) {
      if (!t.addToCalendar) continue;
      try {
        await syncTaskCalendar(t.id);
        ok++;
      } catch (e) {
        failed++;
        console.warn(`  calendar sync failed for ${t.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`Calendar sync: ${ok} ok, ${failed} failed.`);
  } else if (APPLY) {
    console.log('\n(Skipped calendar sync — pass --calendar to also update Outlook.)');
  } else {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to persist.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
