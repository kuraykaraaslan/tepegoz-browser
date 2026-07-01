import { sanitizeText, wrapUntrustedContent } from '@tepegoz/tool-executor';

/**
 * L4 perception (Phase 1a: DOM text only; accessibility tree + vision are later phases). Takes the
 * raw visible text read from the active page, runs it through the Content Sanitizer
 * (zero-width/bidi/homoglyph), caps the length, and wraps it as UNTRUSTED content with the
 * anti-injection footer before it can reach the model. The Electron read (executeJavaScript) lives in
 * the host; this step is pure so it is unit-testable and reusable.
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

/** Cap → sanitize → wrap the raw page text into a model-safe snapshot. */
export function buildPageSnapshot(rawText: string, url: string, title: string): PageSnapshot {
  const { text, flags } = sanitizeText(rawText.slice(0, MAX_PAGE_CHARS));
  return { url, title, content: wrapUntrustedContent(text, url), flags };
}
