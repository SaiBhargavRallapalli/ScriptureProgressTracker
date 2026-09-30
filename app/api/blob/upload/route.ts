import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/dal";
import { MAX_UPLOAD_BYTES, uploadPdfBlob } from "@/lib/blobServer";

// Only ever called from the explicit "Save permanently to cloud" action
// (components/ItemRow.tsx) on a pdf Item that already has a local
// pdfBlob, or from app/api/pdf-search/save/route.ts for a Phase 4b
// discovered PDF that's confirmed public-domain/openly-licensed
// (ARCHITECTURE.md §5.2's storage rule) — never for an unlicensed
// discovered PDF, and never automatically from the regular manual-upload
// flow (lib/items.ts's createItem pdf branch stores straight to Dexie,
// no fetch involved).
//
// Vercel's serverless functions cap request bodies at ~4.5MB on the
// Hobby plan, so a large scanned PDF can fail here — see docs/SETUP.md
// for the tradeoff and the client-direct-upload alternative if that
// becomes a real problem.

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

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

  // file.type is a client-declared MIME type — trivially spoofable — so
  // also check the actual bytes start with a real PDF header before
  // trusting this any further than the size/type checks above already do.
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdfMagicBytes = String.fromCharCode(...header) === "%PDF-";
  if (!isPdfMagicBytes) {
    return NextResponse.json(
      { error: "That file doesn't look like a real PDF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB — Vercel's Hobby plan caps this upload route at 4.5MB. It stays saved locally on this device; try a smaller file for the permanent cloud copy.`,
      },
      { status: 413 }
    );
  }

  try {
    const blob = await uploadPdfBlob(file.name, file);
    return NextResponse.json({ pathname: blob.pathname });
  } catch (err) {
    console.error("Vercel Blob upload failed:", err);
    const message = err instanceof Error && err.message.includes("BLOB_READ_WRITE_TOKEN")
      ? err.message
      : "Upload to cloud storage failed. Try again in a moment.";
    return NextResponse.json({ error: message }, { status: err instanceof Error && err.message.includes("BLOB_READ_WRITE_TOKEN") ? 500 : 502 });
  }
}
