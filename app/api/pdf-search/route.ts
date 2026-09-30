import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/dal";
import { searchArchiveOrgPdfs } from "@/lib/archiveOrg";

// GET /api/pdf-search?q=<query> — Phase 4b's "Find PDF online" action.
// archive.org's search API needs no key, so this route's only job is to
// run the two-step search+per-hit-metadata lookup server-side and hand
// back a normalized list (see lib/archiveOrg.ts). Session-gated like every
// other route here so it isn't a free, unauthenticated archive.org
// scraping relay for anyone who finds the deployed URL.

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Provide a search query (?q=...)." }, { status: 400 });
  }

  try {
    const results = await searchArchiveOrgPdfs(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("archive.org search failed:", err);
    return NextResponse.json({ error: "Search failed. Try again in a moment." }, { status: 502 });
  }
}
