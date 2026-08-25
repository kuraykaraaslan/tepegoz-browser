import { extractArticle } from './extract';

/**
 * The entry point bundled into `READER_EXTRACTOR_SOURCE` and evaluated inside a browsed page.
 *
 * Separate from `extract.ts` so the extractor itself stays a plain function of a `Document` — testable
 * in vitest's jsdom without a browser — and this file is the only part that knows it runs in a page.
 *
 * Wrapped so a throw becomes `null` rather than an exception crossing back through
 * `executeJavaScript`: a page that has patched a DOM global should produce "no article", not an error
 * the user has to interpret.
 */
export function extractFromPage(): unknown {
  try {
    return extractArticle(document);
  } catch {
    return null;
  }
}
