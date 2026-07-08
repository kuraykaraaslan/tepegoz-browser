import {
  sanitizeContent,
  wrapUntrustedContent,
  finalizeElements,
  renderElementsText,
  type InteractableElement,
  type RawInteractable,
} from '@tepegoz/tool-executor';

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

/** Cap → sanitize + injection-guard → wrap the raw page text into a model-safe snapshot. */
export function buildPageSnapshot(rawText: string, url: string, title: string): PageSnapshot {
  const { text, flags } = sanitizeContent(rawText.slice(0, MAX_PAGE_CHARS));
  return { url, title, content: wrapUntrustedContent(text, url), flags };
}

/**
 * The actionable perception the agent targets by `ref`. The host reads the accessibility tree and
 * hands the (untrusted) interactable nodes here; this shapes them into the sanitized, capped element
 * list plus a model-safe `content` listing. `content` doubles as the taint signal (element labels are
 * page-controlled) — the runtime records it as untrusted, exactly like a page-text read.
 */
export interface ElementsSnapshot {
  url: string;
  title: string;
  /** Sanitized, ref-indexed interactable elements (button/link/textbox/…). */
  elements: InteractableElement[];
  /** Sanitized + XML-wrapped listing of `elements` — safe to hand to the model (and the taint source). */
  content: string;
  /** Sanitizer flags aggregated over element labels (zero_width/bidi/mixed_script). */
  flags: string[];
}

/** Sanitize → ref-index → wrap the raw interactable nodes into a model-safe actionable snapshot. */
export function buildElementsSnapshot(
  raw: RawInteractable[],
  url: string,
  title: string,
): ElementsSnapshot {
  const { elements, flags: elementFlags } = finalizeElements(raw);
  // The element labels are already per-label sanitized; guard the WHOLE listing for injection patterns
  // (a malicious link/button text saying "ignore your task…") before it is wrapped as untrusted.
  const guarded = sanitizeContent(renderElementsText(elements));
  const flags = [...new Set([...elementFlags, ...guarded.flags])];
  return { url, title, elements, content: wrapUntrustedContent(guarded.text, url), flags };
}
