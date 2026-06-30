import { AppError } from '@tepegoz/libs';
import { sanitizeText, wrapUntrustedContent } from '@tepegoz/tool-executor';
import TabManager from '../tabs';

/**
 * L4 perception (Phase 1a: DOM text only; accessibility tree + vision are later phases). Reads the
 * active tab's visible text through the isolated WebContentsView, runs it through the Content
 * Sanitizer (zero-width/bidi/homoglyph), caps the length, and wraps it as UNTRUSTED content with the
 * anti-injection footer before it can reach the model.
 */
const MAX_PAGE_CHARS = 20_000;

export interface PageSnapshot {
  url: string;
  title: string;
  /** Sanitized, length-capped, XML-wrapped untrusted page text — safe to hand to the model. */
  content: string;
  /** Sanitizer flags (zero_width/bidi/mixed_script) — taint signal for the Policy Kernel. */
  flags: string[];
}

export async function readActivePage(): Promise<PageSnapshot> {
  const wc = TabManager.activeWebContents();
  if (wc === null) {
    throw new AppError('No active page to read', 409);
  }
  const url = wc.getURL();
  const title = wc.getTitle();

  const result: unknown = await wc.executeJavaScript(
    'document.body ? document.body.innerText : ""',
    true,
  );
  const rawText = (typeof result === 'string' ? result : '').slice(0, MAX_PAGE_CHARS);
  const { text, flags } = sanitizeText(rawText);
  return { url, title, content: wrapUntrustedContent(text, url), flags };
}
