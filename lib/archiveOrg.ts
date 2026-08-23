// Server-only helpers for the Internet Archive's public APIs
// (ARCHITECTURE.md §5.2). No API key, no auth — archive.org's search and
// metadata endpoints are fully public. Still kept server-side (rather
// than called straight from the browser) so the two-step
// search-then-per-hit-metadata-lookup can run in parallel and the
// response gets normalized before it reaches the client.

const ADVANCED_SEARCH_URL = "https://archive.org/advancedsearch.php";
const METADATA_URL = "https://archive.org/metadata";

function firstOrJoin(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : value;
}

interface ArchiveSearchDoc {
  identifier: string;
  title?: string | string[];
  creator?: string | string[];
  licenseurl?: string;
}

interface ArchiveSearchResponse {
  response?: { docs?: ArchiveSearchDoc[] };
}

interface ArchiveMetadataFile {
  name?: string;
}

interface ArchiveMetadataResponse {
  files?: ArchiveMetadataFile[];
}

export interface PdfSearchResult {
  identifier: string;
  title: string;
  creator?: string;
  sourceUrl: string;
  /** Present = confirmed public-domain/openly-licensed. Absent = unknown — see the storage rule in ARCHITECTURE.md §5.2. */
  licenseUrl?: string;
}

async function findPdfFilename(identifier: string): Promise<string | null> {
  const res = await fetch(`${METADATA_URL}/${encodeURIComponent(identifier)}`);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as ArchiveMetadataResponse | null;
  const files = body?.files ?? [];
  const pdf = files.find((f) => f.name?.toLowerCase().endsWith(".pdf"));
  return pdf?.name ?? null;
}

export async function searchArchiveOrgPdfs(query: string, rows = 10): Promise<PdfSearchResult[]> {
  const searchUrl = new URL(ADVANCED_SEARCH_URL);
  searchUrl.searchParams.set("q", `${query} AND mediatype:texts`);
  searchUrl.searchParams.append("fl[]", "identifier");
  searchUrl.searchParams.append("fl[]", "title");
  searchUrl.searchParams.append("fl[]", "licenseurl");
  searchUrl.searchParams.append("fl[]", "creator");
  searchUrl.searchParams.set("output", "json");
  searchUrl.searchParams.set("rows", String(rows));

  const res = await fetch(searchUrl.toString());
  if (!res.ok) {
    throw new Error(`archive.org search failed (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as ArchiveSearchResponse;
  const docs = body.response?.docs ?? [];

  // Per-hit metadata lookups run in parallel — up to `rows` extra
  // requests, fine for archive.org's no-key public API at personal scale.
  const results = await Promise.all(
    docs.map(async (doc): Promise<PdfSearchResult | null> => {
      const filename = await findPdfFilename(doc.identifier);
      if (!filename) return null; // no PDF file in this item — skip it
      return {
        identifier: doc.identifier,
        title: firstOrJoin(doc.title) || doc.identifier,
        creator: firstOrJoin(doc.creator),
        sourceUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(filename)}`,
        licenseUrl: doc.licenseurl || undefined,
      };
    })
  );

  return results.filter((r): r is PdfSearchResult => r !== null);
}

/**
 * Validates that a URL actually points at archive.org before the server
 * fetches it on the caller's behalf — used by both the permanent-save
 * route and the link-proxy route so neither becomes an open "fetch any
 * URL" proxy just because a client can supply one.
 */
export function assertArchiveOrgUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.hostname !== "archive.org" && !url.hostname.endsWith(".archive.org")) {
    throw new Error("This route only fetches from archive.org.");
  }
  return url;
}
