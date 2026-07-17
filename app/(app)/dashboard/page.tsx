import { auth } from '@/auth';
import { buildAttention } from '@/lib/dashboard/attention';
import { buildMyDay } from '@/lib/dashboard/my-day';
import { DashboardShell } from './dashboard-shell';
import { AttentionZone } from './attention-zone';
import { MyDayZone } from './my-day-zone';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();

  // Auth (unauthenticated / must-change-password) is already enforced by
  // app/(app)/layout.tsx. Customers (userType='customer') have no dedicated
  // dashboard view yet (see spec Ζώνη scope) — they fall through to the same
  // member-scoped zones with mostly-empty attention/my-day lists, exactly as
  // the previous dashboard behaved for them.
  const userId = session?.user?.id ?? '';
  const displayName = session?.user?.name ?? session?.user?.email ?? 'εκεί';
  const firstName = displayName.split(' ')[0] ?? displayName;
  const isPrivileged = session?.user?.role === 'admin' || session?.user?.role === 'manager';

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Καλημέρα' : hour < 18 ? 'Καλησπέρα' : 'Καλησπέρα';
  const dateLabel = new Intl.DateTimeFormat('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  const scope = { userId, isPrivileged, now };

  const [attention, myDay] = await Promise.all([buildAttention(scope), buildMyDay(scope)]);

  return (
    <DashboardShell
      greeting={greeting}
      firstName={firstName}
      dateLabel={dateLabel}
      main={
        <>
          <AttentionZone items={attention} />
          <MyDayZone data={myDay} />
        </>
      }
      aside={null}
    />
  );
}
