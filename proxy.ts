import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_DURATION_SECONDS,
  SESSION_REFRESH_THRESHOLD_MS,
  signSession,
  verifySession,
} from "@/lib/auth/session";

// Phase 7 (accounts): this is the *optimistic* auth check only — a signed-
// cookie decrypt/expiry check, no database call — per the Next.js
// authentication guide's explicit guidance that Proxy should never be the
// sole authorization boundary. The real, enforced check is
// lib/auth/dal.ts's requireSession()/requireApiSession(), called from
// every Server Component layout and every app/api/**/route.ts handler.
//
// Named proxy.ts, not middleware.ts: Next.js 16 deprecated the
// `middleware` file convention in favor of `proxy` (same mechanism, same
// config.matcher shape, function just renamed) — this project tracks
// current Next.js, so it uses the current name rather than the deprecated
// one flagged by `next build` itself. Proxy defaults to the Node.js
// runtime as of v16, so the jose-based cookie verification below runs
// without any Edge-runtime restriction.

const PUBLIC_PAGE_PATHS = new Set(["/login", "/signup"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicPage = PUBLIC_PAGE_PATHS.has(pathname);

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (!session) {
    if (isPublicPage) return NextResponse.next();
    if (isApiRoute) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();

  // Sliding expiry: re-sign once the token is within
  // SESSION_REFRESH_THRESHOLD_MS of expiring, so an active user is never
  // logged out mid-use. Cheap cookie-in/cookie-out, no DB call — matches
  // the "optimistic only" role this file is meant to play.
  const msUntilExpiry = session.expiresAt - Date.now();
  if (msUntilExpiry < SESSION_REFRESH_THRESHOLD_MS) {
    const refreshed = await signSession({ userId: session.userId, email: session.email });
    response.cookies.set(SESSION_COOKIE_NAME, refreshed, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_DURATION_SECONDS,
    });
  }

  return response;
}

export const config = {
  // Everything except the public auth pages, static assets, and the PWA
  // manifest/service-worker/icons — those must stay reachable while
  // logged out (the offline app shell precaches them).
  matcher: ["/((?!_next/static|_next/image|manifest\\.json|sw\\.js|icons/|favicon\\.ico).*)"],
};
