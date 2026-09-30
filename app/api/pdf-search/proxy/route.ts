import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/dal";
import { assertArchiveOrgUrl } from "@/lib/archiveOrg";

// GET /api/pdf-search/proxy?url=<archive.org PDF URL>
//
// Why this exists: for a Phase 4b "link"-storage Item (no clear license,
// or licensed but the user chose "add as link" instead of "save
// permanently"), Item.sourceUrl has to be something the browser can
// plain fetch() successfully — that's what resolveAndCachePdfBlob
// (lib/items.ts, unmodified from Phase 4) does the first time the item
// is opened. Testing against the real archive.org download CDN showed
// its response has no Access-Control-Allow-Origin header, so a direct
// browser-side fetch() of the archive.org URL is blocked by CORS.
//
// This route is a same-origin stand-in: it streams the bytes through
// from our server to the browser and does NOT persist them anywhere —
// no Blob call, nothing written server-side, nothing left behind once
// the response finishes. That keeps ARCHITECTURE.md §5.2's storage rule
// intact for unlicensed PDFs (we're never "the one hosting a copy... on
// a public server reachable by anyone with the link" — this proxies a
// request, it doesn't store a file at a stable URL). The only thing
// that ends up durably stored is the local IndexedDB cache Phase 4's
// PdfViewer writes on the device that opened it, exactly as specified.
//
// Item.sourceUrl for a "link" item points at THIS route (with the real
// archive.org URL as the `url` param), not at the archive.org URL
// directly — see lib/items.ts's createItemFromDiscoveredPdfLink.

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url param." }, { status: 400 });
  }

  let url: URL;
  try {
    url = assertArchiveOrgUrl(raw);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid URL." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString());
  } catch {
    return NextResponse.json({ error: "Couldn't reach archive.org. Try again in a moment." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `archive.org returned HTTP ${upstream.status}.` }, { status: 502 });
  }

  // Stream straight through rather than buffering — some of these PDFs
  // run well over 100MB, so holding the whole thing in memory here would
  // be wasteful (and on Vercel, could hit function memory/time limits on
  // very large files; that tradeoff is out of scope for this phase).
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/pdf",
      "Content-Length": upstream.headers.get("content-length") || "",
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
