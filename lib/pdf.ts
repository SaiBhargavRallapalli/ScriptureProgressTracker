// Lazily loads pdfjs-dist, client-side only.
//
// This must never be imported/evaluated at module top-level of a "use
// client" component: Next.js still renders client components' initial
// HTML on the server, and pdf.js needs real browser Canvas/Worker APIs
// that don't exist under Node. Calling loadPdfjs() from inside a
// useEffect (which only ever runs after mount, in the browser) sidesteps
// that entirely — the dynamic import() below never executes during SSR.

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("pdf.js only loads in the browser."));
  }

  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjsLib) => {
      // Bundler-local worker (not a CDN URL) so it's one of our own
      // hashed _next/static assets — precached by the service worker
      // like everything else, so opening a PDF still works offline.
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjsLib;
    });
  }

  return pdfjsPromise;
}
