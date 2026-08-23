import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

// The project's Blob store is private (Vercel's current default for new
// stores), so a blob's real URL 403s for a plain client-side fetch — it
// needs an auth header the browser never gets to hold. This route is
// that authentication boundary: it holds BLOB_READ_WRITE_TOKEN
// server-side, fetches the blob with it via get(), and streams the bytes
// back. Item.sourceUrl for a cloud-saved PDF points *here*
// (/api/blob/file?pathname=...), not at the private blob URL directly —
// see lib/items.ts's markPdfSavedToCloud.
//
// This is a single-user app with no accounts (ARCHITECTURE.md §2), so
// there's no per-user auth to check here beyond "does this server have
// the token" — a multi-user version of this app would add a real auth
// check on `request` before calling get().
export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
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
