import { auth } from '@/auth';
import { buildReportsData } from '@/lib/reports';
import { ReportsClient } from './reports-client';

export default async function ReportsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? '';
  const isPrivileged = session?.user?.role === 'admin' || session?.user?.role === 'manager';
  const data = await buildReportsData({ userId, isPrivileged });
  return <ReportsClient data={data} />;
}
