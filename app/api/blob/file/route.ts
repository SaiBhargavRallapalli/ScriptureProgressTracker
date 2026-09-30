import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireApiSession } from "@/lib/auth/dal";
import { ensureSchema, userOwnsItemWithSourceUrl } from "@/lib/syncDb";

// The project's Blob store is private (Vercel's current default for new
// stores), so a blob's real URL 403s for a plain client-side fetch — it
// needs an auth header the browser never gets to hold. This route is
// that authentication boundary: it holds BLOB_READ_WRITE_TOKEN
// server-side, fetches the blob with it via get(), and streams the bytes
// back. Item.sourceUrl for a cloud-saved PDF points *here*
// (/api/blob/file?pathname=...), not at the private blob URL directly —
// see lib/items.ts's markPdfSavedToCloud.
export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const pathname = request.nextUrl.searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
  }

  // The store is single, shared, private storage for the whole
  // deployment — a valid session alone would let any account read any
  // other account's blob by pathname. Confirm this session's own account
  // actually has an Item pointing at it before streaming anything back.
  const expectedSourceUrl = `/api/blob/file?pathname=${encodeURIComponent(pathname)}`;
  try {
    await ensureSchema();
    const owns = await userOwnsItemWithSourceUrl(session.userId, expectedSourceUrl);
    if (!owns) {
      return NextResponse.json({ error: "PDF not found in cloud storage." }, { status: 404 });
    }
  } catch (err) {
    console.error("Blob ownership check failed:", err);
    return NextResponse.json({ error: "Database is unavailable. Try again in a moment." }, { status: 502 });
  }

  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "PDF not found in cloud storage." }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/pdf",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("Vercel Blob read failed:", err);
    return NextResponse.json({ error: "Couldn't read that file from cloud storage." }, { status: 502 });
  }
}
