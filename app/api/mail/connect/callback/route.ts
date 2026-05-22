import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { decodeIdTokenClaims, exchangeCodeForTokens } from '@/lib/graph-mail';

// Microsoft redirects here after the user grants Mail.Read. We verify the
// state cookie matches the response (CSRF), exchange the code for tokens, and
// upsert the per-user mail connection. Errors bounce back to /profile with a
// query string the client surfaces as a toast.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  const profileUrl = new URL('/profile', url.origin);

  const session = await auth();
  if (!session?.user?.id || session.user.userType === 'customer') {
    profileUrl.searchParams.set('mail', 'forbidden');
    return NextResponse.redirect(profileUrl);
  }

  if (errorParam) {
    profileUrl.searchParams.set('mail', 'denied');
    profileUrl.searchParams.set('detail', errorParam.slice(0, 200));
    return NextResponse.redirect(profileUrl);
  }
  if (!code || !stateParam) {
    profileUrl.searchParams.set('mail', 'missing');
    return NextResponse.redirect(profileUrl);
  }

  const cookieState = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('fpm_mail_state='))
    ?.split('=')[1];
  if (!cookieState || cookieState !== stateParam || !stateParam.startsWith(`${session.user.id}.`)) {
    profileUrl.searchParams.set('mail', 'state_mismatch');
    return NextResponse.redirect(profileUrl);
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    console.error('mail token exchange failed', err);
    profileUrl.searchParams.set('mail', 'token_error');
    return NextResponse.redirect(profileUrl);
  }

  const claims = tokens.id_token ? decodeIdTokenClaims(tokens.id_token) : {};
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.userMailConnection.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      msTenantId: claims.tid ?? 'unknown',
      msObjectId: claims.oid ?? 'unknown',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scopes: tokens.scope,
      expiresAt,
    },
    update: {
      msTenantId: claims.tid ?? 'unknown',
      msObjectId: claims.oid ?? 'unknown',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scopes: tokens.scope,
      expiresAt,
    },
  });

  profileUrl.searchParams.set('mail', 'connected');
  const res = NextResponse.redirect(profileUrl);
  res.cookies.set('fpm_mail_state', '', { path: '/api/mail/connect', maxAge: 0 });
  return res;
}
