import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { gateRedirect } from "@/lib/portal/route-gate";

const publicRoutes = ["/auth/signin", "/auth/signup", "/"];

// Auth.js session cookie names, across the v4/v5 prefixes, the __Secure- variant
// used over HTTPS, and the .0/.1 chunks written when a session exceeds 4KB.
const SESSION_COOKIE_RE =
  /^(__Secure-)?(authjs|next-auth)\.session-token(\.\d+)?$/;

/**
 * A session cookie that survives `auth()` returning null cannot be decrypted —
 * the usual cause is AUTH_SECRET having been rotated while browsers still hold
 * cookies sealed with the old one. Auth.js logs a JWTSessionError and treats the
 * request as anonymous, but the cookie stays put and is replayed (and re-logged)
 * on every subsequent request. Expiring it here makes secret rotation
 * self-healing instead of requiring each user to clear cookies by hand.
 */
function clearStaleSessionCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (SESSION_COOKIE_RE.test(cookie.name)) {
      response.cookies.delete({ name: cookie.name, path: "/" });
    }
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Public ticket status pages — addressed by unguessable token, no session.
  if (pathname.startsWith("/t/")) {
    return NextResponse.next();
  }

  // Public help center — read-only, only isPublic entries are served.
  if (pathname.startsWith("/help/")) {
    return NextResponse.next();
  }

  const session = await auth();

  if (!session?.user) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return clearStaleSessionCookies(request, NextResponse.redirect(signInUrl));
  }

  const role = (session.user as { role?: string }).role || "member";
  const userType = (session.user as { userType?: string }).userType || "employee";

  // Ένα σημείο ελέγχου για τον διαχωρισμό πελάτη/ομάδας. Η απόφαση ζει στο
  // lib/portal/route-gate.ts ώστε να δοκιμάζεται χωρίς HTTP server.
  const redirectTo = gateRedirect(pathname, userType, role);
  if (redirectTo && redirectTo !== pathname) {
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.user.id);
  requestHeaders.set("x-user-type", userType);
  requestHeaders.set("x-user-role", role);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|public).*)"],
};
