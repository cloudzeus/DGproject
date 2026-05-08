import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ChangePasswordForm } from './change-password-form';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/signin?callbackUrl=/auth/change-password');
  }

  // If they don't actually need to change anything, send them home.
  if (!session.user.mustChangePassword) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <ChangePasswordForm userEmail={session.user.email ?? ''} userName={session.user.name ?? ''} />
    </div>
  );
}
