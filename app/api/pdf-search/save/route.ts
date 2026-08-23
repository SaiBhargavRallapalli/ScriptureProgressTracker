import { NextResponse } from "next/server";
import { assertArchiveOrgUrl } from "@/lib/archiveOrg";
import { MAX_UPLOAD_BYTES, uploadPdfBlob } from "@/lib/blobServer";

// POST /api/pdf-search/save — the ONLY entry point for Phase 4b's
// "Save permanently" action on a discovered PDF. ARCHITECTURE.md §5.2's
// storage rule is enforced by the caller (components/PdfDiscovery.tsx
// only ever shows this action when the picked result has a licenseUrl),
// but this route also re-checks it below so a licensed-only action can
// never accidentally be reached with an unlicensed pick.
//
// The PDF is fetched *here*, server-side, rather than asking the browser
// to fetch archive.org's URL directly and upload the bytes — archive.org's
// download CDN doesn't send Access-Control-Allow-Origin (confirmed via a
// direct request against a real download redirect target), so a
// browser-side fetch() of an archive.org PDF is blocked by CORS. Routing
// through here avoids that entirely.

interface SaveBody {
  sourceUrl?: string;
  title?: string;
  licenseUrl?: string;
}

export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!body.licenseUrl) {
    return NextResponse.json(
      { error: "This action is only for confirmed public-domain/openly-licensed PDFs." },
      { status: 400 }
    );
  }
  if (!body.sourceUrl) {
    return NextResponse.json({ error: "Missing sourceUrl." }, { status: 400 });
  }

  let url: URL;
  try {
    url = assertArchiveOrgUrl(body.sourceUrl);
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

  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `This PDF is ${(contentLength / (1024 * 1024)).toFixed(1)}MB — Vercel's Hobby plan caps permanent cloud saves at 4.5MB. Use "Add as link" instead — it still works offline after you open it once while online.`,
      },
      { status: 413 }
    );
  }

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `This PDF is ${(bytes.byteLength / (1024 * 1024)).toFixed(1)}MB — Vercel's Hobby plan caps permanent cloud saves at 4.5MB. Use "Add as link" instead — it still works offline after you open it once while online.`,
      },
      { status: 413 }
    );
  }

  const filename = decodeURIComponent(url.pathname.split("/").pop() || "document.pdf");

  try {
    const blob = await uploadPdfBlob(filename, bytes);
    return NextResponse.json({ pathname: blob.pathname });
  } catch (err) {
    console.error("Vercel Blob upload (from archive.org) failed:", err);
    const message =
      err instanceof Error && err.message.includes("BLOB_READ_WRITE_TOKEN")
        ? err.message
        : "Upload to cloud storage failed. Try again in a moment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
