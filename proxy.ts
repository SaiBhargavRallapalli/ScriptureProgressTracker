import { NextResponse, type NextRequest } from "next/server";

// Protects every /api/sync/* route with the single bearer token from
// ARCHITECTURE.md §2/§6 — checked once here rather than repeated in
// each route handler. This is the app's only "auth": a personal,
// single-user tool doesn't need a real user/session system (see
// ARCHITECTURE.md §2's reasoning), just a long-lived secret that keeps
// the sync endpoint from being an open read/write API to anyone who
// finds the URL.
//
// Named proxy.ts, not middleware.ts: Next.js 16 deprecated the
// `middleware` file convention in favor of `proxy` (same mechanism,
// same config.matcher shape, function just renamed) — this project
// tracks current Next.js, so it uses the current name rather than the
// deprecated one flagged by `next build` itself.
export function proxy(request: NextRequest) {
  const token = process.env.SYNC_TOKEN;
  if (!token) {
    // Fail closed: an unconfigured server should refuse sync requests,
    // not silently accept them from anyone.
    return NextResponse.json(
      { error: "Sync is not configured on the server (SYNC_TOKEN is unset)." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${token}`;

  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/sync/:path*",
};
