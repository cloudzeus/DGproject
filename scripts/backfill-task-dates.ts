/**
 * Backfill task start/due times so tasks that were given a DATE but no real
 * time-slot get scheduled into business hours (09:00–18:30) and, crucially,
 * SEQUENCED one after another per person/day instead of piling up at the same
 * instant.
 *
 * A task "needs slotting" when it has a date anchor, is not done, and any of:
 *   - the anchor sits at local midnight (00:00 — no time-of-day), OR
 *   - it has a startDate but NO dueDate (no duration — the noon/"no time"
 *     default), OR
 *   - startDate === dueDate (zero-length).
 * Properly scheduled tasks (start < due with a real time) are left untouched.
 *
 * Placement:
 *   - Multi-day (start & due on different days): PRESERVE the span — 09:00 on the
 *     start day → 18:30 on the due day.
 *   - Otherwise: next FREE business slot for the task's people that day, duration
 *     = estimatedHours (min 1h), cascading after tasks already placed. A
 *     deterministic in-memory occupancy map means the dry-run preview equals what
 *     --apply writes.
 *
 * DEFAULT = DRY RUN. Pass `--apply` to persist. Pass `--calendar` (with --apply)
 * to also re-sync affected tasks to Outlook.
 *
 *   npx tsx scripts/backfill-task-dates.ts
 *   npx tsx scripts/backfill-task-dates.ts --apply
 *   npx tsx scripts/backfill-task-dates.ts --apply --calendar
 *
 * Server timezone is Europe/Athens, so getHours()/setHours() are local business
 * time — matching lib/business-hours.ts and the create-time auto-slot logic.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { normalizeToBusinessHours, hasTimeComponent } from '../lib/business-hours';
import {
  type Occupancy,
  sameLocalDay,
  atBusinessStart,
  atBusinessEnd,
  latestEndFor,
  markBusy,
} from '../lib/task-scheduling';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
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
type TaskRow = {
  id: string;
  title: string;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  createdById: string;
  addToCalendar: boolean;
  project: { name: string };
  assignees: { userId: string }[];
};

function usersOf(t: TaskRow): string[] {
  return Array.from(new Set([t.createdById, ...t.assignees.map((a) => a.userId)].filter(Boolean)));
}

async function main() {
  console.log(`\n=== Task date/time backfill & sequencing — ${APPLY ? 'APPLY' : 'DRY RUN'} ===\n`);

  const tasks = (await prisma.task.findMany({
    where: {
      project: { status: { not: 'archived' } },
      status: { not: 'done' },
      OR: [{ startDate: { not: null } }, { dueDate: { not: null } }],
    },
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      dueDate: true,
      estimatedHours: true,
      createdById: true,
      addToCalendar: true,
      project: { select: { name: true } },
      assignees: { select: { userId: true } },
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  })) as TaskRow[];

  const needsFix = (t: TaskRow): boolean => {
    const anchor = t.dueDate ?? t.startDate;
    if (!anchor) return false;
    if (!hasTimeComponent(anchor)) return true; // midnight → no time set
    if (t.startDate && !t.dueDate) return true; // no duration (noon default)
    if (t.startDate && t.dueDate && t.startDate.getTime() === t.dueDate.getTime()) return true; // zero-length
    return false;
  };

  const fixlist = tasks.filter(needsFix);

  // Seed occupancy from the STABLE (already properly-scheduled) tasks so we
  // cascade after them, not on top of them.
  const occ: Occupancy = new Map();
  for (const t of tasks) {
    if (needsFix(t)) continue;
    if (t.startDate && t.dueDate) markBusy(occ, usersOf(t), t.startDate, t.dueDate);
  }

  console.log(`Scanned ${tasks.length} dated, non-done tasks in active projects.`);
  console.log(`→ ${fixlist_count(fixlist)} need scheduling/sequencing.\n`);

  const preview: string[] = [];
  const updates: { id: string; startDate: Date; dueDate: Date; addToCalendar: boolean }[] = [];
  let calendarCount = 0;

  for (const t of fixlist) {
    let newStart: Date;
    let newDue: Date;

    if (t.startDate && t.dueDate && !sameLocalDay(t.startDate, t.dueDate)) {
      // Multi-day: preserve the span, just set business hours.
      newStart = atBusinessStart(t.startDate);
      newDue = atBusinessEnd(t.dueDate);
    } else {
      const anchor = (t.dueDate ?? t.startDate)!;
      const users = usersOf(t);
      const baseline = atBusinessStart(anchor).getTime();
      const earliest = Math.max(baseline, latestEndFor(occ, users, anchor));
      newStart = normalizeToBusinessHours(new Date(earliest));
      const durationHours = t.estimatedHours && t.estimatedHours > 0 ? t.estimatedHours : 1;
      newDue = new Date(newStart.getTime() + durationHours * 3600 * 1000);
      markBusy(occ, users, newStart, newDue);
    }

    updates.push({ id: t.id, startDate: newStart, dueDate: newDue, addToCalendar: t.addToCalendar });
    if (t.addToCalendar) calendarCount++;

    if (preview.length < 40) {
      preview.push(
        `  • [${t.project.name.slice(0, 26)}] ${t.title.slice(0, 40)}\n` +
          `      ${fmt(t.startDate)} / ${fmt(t.dueDate)}  →  ${fmt(newStart)} / ${fmt(newDue)}` +
          (t.addToCalendar ? '  (cal)' : ''),
      );
    }
  }

  console.log(preview.join('\n'));
  if (fixlist.length > 40) console.log(`  … and ${fixlist.length - 40} more`);
  console.log(`\n${calendarCount} of these have addToCalendar=true.`);

  if (APPLY) {
    for (const u of updates) {
      await prisma.task.update({
        where: { id: u.id },
        data: { startDate: u.startDate, dueDate: u.dueDate },
      });
    }
    console.log(`\nApplied ${updates.length} updates to the database.`);

    if (CALENDAR) {
      console.log('Re-syncing calendars…');
      const { syncTaskCalendar } = await import('../lib/task-calendar-sync');
      let ok = 0;
      let failed = 0;
      for (const u of updates) {
        if (!u.addToCalendar) continue;
        try {
          await syncTaskCalendar(u.id);
          ok++;
        } catch (e) {
          failed++;
          console.warn(`  sync failed ${u.id}: ${e instanceof Error ? e.message : e}`);
        }
      }
      console.log(`Calendar sync: ${ok} ok, ${failed} failed.`);
    } else {
      console.log('(Skipped calendar sync — pass --calendar to also update Outlook.)');
    }
  } else {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to persist.');
  }

  await prisma.$disconnect();
}

// Small helper kept separate so the count is obvious in the summary line.
function fixlist_count(list: unknown[]): number {
  return list.length;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
