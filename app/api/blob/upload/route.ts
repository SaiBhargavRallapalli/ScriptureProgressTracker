import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Only ever called from the explicit "Save permanently to cloud" action
// (components/ItemRow.tsx) on a pdf Item that already has a local
// pdfBlob — never automatically from the regular manual-upload flow
// (lib/items.ts's createItem pdf branch stores straight to Dexie, no
// fetch involved) and never for Phase 4b's auto-discovered PDFs unless
// they're clearly public-domain/openly-licensed (ARCHITECTURE.md §5.2's
// storage rule — Phase 4b doesn't exist yet, so today this route has
// exactly one caller).
//
// Vercel's serverless functions cap request bodies at ~4.5MB on the
// Hobby plan, so a large scanned PDF can fail here — see docs/SETUP.md
// for the tradeoff and the client-direct-upload alternative if that
// becomes a real problem.

const MAX_BYTES = 4.5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN is not configured on the server. Add it to .env.local for local dev, or to your Vercel project's environment variables for production.",
      },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files can be saved permanently this way." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB — Vercel's Hobby plan caps this upload route at 4.5MB. It stays saved locally on this device; try a smaller file for the permanent cloud copy.`,
      },
      { status: 413 }
    );
  }

  try {
    // Private store: the resulting blob.url isn't fetchable directly by
    // the browser (it 403s without an auth header). Reads go through
    // app/api/blob/file/route.ts instead, which holds the token
    // server-side and streams the bytes — see that route for why.
    const blob = await put(file.name, file, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: true,
    });
    return NextResponse.json({ pathname: blob.pathname });
  } catch (err) {
    console.error("Vercel Blob upload failed:", err);
    return NextResponse.json(
      { error: "Upload to cloud storage failed. Try again in a moment." },
      { status: 502 }
    );
  }
}
