import { Logger } from '@tepegoz/libs';
import { READER_LIMITS, type ReaderArticle } from '@tepegoz/reader';
import TabManager from '../tabs';
import { READER_EXTRACTOR_SOURCE } from './reader-bundle';

/**
 * Run article extraction inside the active tab and hand the result back as structured blocks.
 *
 * **The extractor runs in the PAGE, and that is the cheap part of this design.** The document is
 * already parsed there, so no DOM implementation has to be shipped into the main process to re-parse
 * it. What comes back is data, not a document: plain-text blocks that the trusted chrome renders with
 * ordinary React. Nothing crosses this boundary that could be markup.
 *
 * The returned value is treated as untrusted anyway. `executeJavaScript` resolves with whatever the
 * page's JS context produced, and a hostile page could in principle interfere with the extractor's
 * globals, so the shape is re-validated here rather than trusted because we wrote the source. That is
 * the same rule every other trust boundary in this repo follows.
 */

/** Extraction is bounded work on a parsed DOM; a page that takes longer than this is not answering. */
const EXTRACT_TIMEOUT_MS = 5_000;

function isBlock(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  if (b.kind === 'list') {
    return (
      typeof b.ordered === 'boolean' &&
      Array.isArray(b.items) &&
      b.items.length <= READER_LIMITS.maxListItems &&
      b.items.every((i) => typeof i === 'string' && i.length <= READER_LIMITS.maxBlockChars)
    );
  }
  if (b.kind === 'image') {
    return (
      typeof b.src === 'string' &&
      b.src.length <= READER_LIMITS.maxSrcChars &&
      // Re-checked here, not merely in the page: this is the value that becomes an `<img src>` in the
      // trusted chrome, so the scheme allow-list is enforced on THIS side of the boundary too.
      (/^https?:\/\//i.test(b.src) || /^data:image\//i.test(b.src)) &&
      typeof b.alt === 'string'
    );
  }
  if (b.kind === 'heading') return (b.level === 2 || b.level === 3) && typeof b.text === 'string';
  if (b.kind === 'paragraph' || b.kind === 'quote' || b.kind === 'code') {
    return typeof b.text === 'string' && b.text.length <= READER_LIMITS.maxBlockChars;
  }
  return false;
}

function isArticle(value: unknown): value is ReaderArticle {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.title === 'string' &&
    a.title.length <= READER_LIMITS.maxTitleChars &&
    typeof a.byline === 'string' &&
    typeof a.siteName === 'string' &&
    typeof a.wordCount === 'number' &&
    Number.isFinite(a.wordCount) &&
    Array.isArray(a.blocks) &&
    a.blocks.length <= READER_LIMITS.maxBlocks &&
    a.blocks.every(isBlock)
  );
}

/**
 * Extract the active tab's article, or `null` when there is none.
 *
 * `null` is a real answer with its own copy in the UI — "this page has no article" is a fact the user
 * can act on, where "the reader failed" reads like a bug and sends them looking for one.
 */
export async function readActiveTabArticle(): Promise<ReaderArticle | null> {
  const wc = TabManager.focused()?.activeWebContents() ?? null;
  if (wc === null || wc.isDestroyed()) return null;

  try {
    const raw: unknown = await Promise.race([
      wc.executeJavaScript(READER_EXTRACTOR_SOURCE, false),
      new Promise((resolve) => setTimeout(() => resolve('__TIMEOUT__'), EXTRACT_TIMEOUT_MS)),
    ]);
    if (raw === '__TIMEOUT__') {
      Logger.warn('Reader extraction timed out');
      return null;
    }
    if (raw === null) return null;
    if (!isArticle(raw)) {
      // Not an error the user needs to see: a page that produced an unusable shape is, for their
      // purposes, a page with no article.
      Logger.warn('Reader extraction returned an unusable shape');
      return null;
    }
    return raw;
  } catch (err: unknown) {
    // A page can refuse to run scripts, navigate mid-extraction, or throw from a patched global. None
    // of that is worth an error dialog — the reading view simply does not open.
    Logger.warn('Reader extraction failed', { err: String(err) });
    return null;
  }
}
