import { put } from "@vercel/blob";

// Shared by app/api/blob/upload/route.ts (manual PDF upload, Phase 4) and
// app/api/pdf-search/save/route.ts (archive.org "Save permanently" for a
// confirmed-licensed discovered PDF, Phase 4b) — same private-store
// upload, same 4.5MB Hobby-plan cap.

export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export async function uploadPdfBlob(
  filename: string,
  data: Blob | ArrayBuffer,
  contentType = "application/pdf"
) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured on the server. Add it to .env.local for local dev, or to your Vercel project's environment variables for production."
    );
  }
  // @vercel/blob's PutBody type doesn't include a raw ArrayBuffer (only
  // Blob/File/Buffer/Readable/ReadableStream) — normalize to a Blob,
  // which every caller can produce trivially.
  const body = data instanceof Blob ? data : new Blob([data], { type: contentType });
  // Private store: the resulting blob.url isn't fetchable directly by the
  // browser (it 403s without an auth header). Reads go through
  // app/api/blob/file/route.ts, which holds the token server-side and
  // streams the bytes — see that route for why.
  return put(filename, body, {
    access: "private",
    contentType,
    addRandomSuffix: true,
  });
}
