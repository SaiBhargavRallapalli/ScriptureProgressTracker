import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/dal";
import { assertShlokamUrl } from "@/lib/shlokam";

// GET /api/text-search/proxy?url=<shlokam.org page URL>
//
// Same shape as app/api/pdf-search/proxy/route.ts, for text pages instead
// of PDFs: fetches the page server-side (so this never becomes a public
// CORS/hotlinking problem for shlokam.org) and does NOT persist it
// anywhere — no Blob call, nothing written server-side. Item.sourceUrl
// for a text_link Item points at THIS route, not the raw shlokam.org URL
// — see lib/items.ts's createItemsFromShlokamGita.
//
// Strips <script>/<style> tags before returning the HTML as defense in
// depth #1 — components/TextViewer.tsx's sandboxed iframe (no
// allow-scripts) is defense in depth #2, since this is third-party markup
// we don't otherwise control.

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url param." }, { status: 400 });
  }

  let url: URL;
  try {
    url = assertShlokamUrl(raw);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid URL." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString());
  } catch {
    return NextResponse.json({ error: "Couldn't reach shlokam.org. Try again in a moment." }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: `shlokam.org returned HTTP ${upstream.status}.` }, { status: 502 });
  }

  const html = await upstream.text();
  const sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  return new NextResponse(sanitized, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
