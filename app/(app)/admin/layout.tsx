import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/admin/users');
  }

  if (session.user.role !== 'admin') {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
