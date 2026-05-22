import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { auth } from '@/auth';
import { buildAuthorizeUrl } from '@/lib/graph-mail';

// Kicks off the incremental-consent flow for mailbox access. Gated to
// non-customer users who signed in via Microsoft — customers never see the
// "Connect mailbox" button, and credential users have no Microsoft identity
// to attach the mail connection to.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }
  if (session.user.userType === 'customer') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // State is a single-use CSRF nonce paired to the user. We round-trip it via
  // an httpOnly cookie that the callback checks before exchanging the code.
  const nonce = randomBytes(16).toString('hex');
  const state = `${session.user.id}.${nonce}`;
  const url = buildAuthorizeUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set('fpm_mail_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/mail/connect',
  });
  return res;
}
