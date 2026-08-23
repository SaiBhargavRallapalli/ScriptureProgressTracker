import { NextRequest, NextResponse } from "next/server";
import { searchArchiveOrgPdfs } from "@/lib/archiveOrg";

// GET /api/pdf-search?q=<query> — Phase 4b's "Find PDF online" action.
// archive.org's search API needs no key, so this route's only job is to
// run the two-step search+per-hit-metadata lookup server-side and hand
// back a normalized list (see lib/archiveOrg.ts).

export async function GET(request: NextRequest) {
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
