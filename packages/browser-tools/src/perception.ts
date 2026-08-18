import {
  sanitizeContent,
  wrapUntrustedContent,
  diffElements,
  digestOf,
  finalizeElements,
  isPerceptionV2Enabled,
  renderDiffedElements,
  renderElementsText,
  renderElementTsv,
  TSV_HEADER,
  type InteractableElement,
  type RawInteractable,
  type SnapshotDigest,
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
  /** Hand back on the next call for this tab to keep the listing diffed (S2 PR2). */
  memory: ElementsDiffMemory;
}

/**
 * What the model was shown last time on this page, so the next listing can send only what moved (S2
 * PR2). The caller owns one of these per tab; a navigation drops it, because a ref from another page
 * addresses nothing here.
 */
export interface ElementsDiffMemory {
  url: string;
  digest: SnapshotDigest;
  step: number;
}

/**
 * Render the listing the model reads. Perception v2 sends a compact table, diffed against the previous
 * snapshot with runs of unchanged elements elided; otherwise the full pseudo-HTML listing, unchanged.
 *
 * Elision is sound ONLY because v2's refs are identity-stable: "42 elements unchanged, refs still valid"
 * is actionable when a ref still means what it meant three steps ago, and a hole in the model's view when
 * it does not. That is why one flag gates both.
 */
function renderListing(
  elements: InteractableElement[],
  previous: SnapshotDigest | null,
): string {
  if (!isPerceptionV2Enabled()) return renderElementsText(elements);
  if (elements.length === 0) return '(no interactable elements found)';
  const diff = diffElements(elements, previous);
  const body = renderDiffedElements(elements, diff, (el, change) =>
    change === 'changed' ? `~${renderElementTsv(el)}` : renderElementTsv(el),
  );
  return `${TSV_HEADER}\n${body}`;
}

/**
 * Sanitize → ref-index → wrap the raw interactable nodes into a model-safe actionable snapshot.
 *
 * `memory` carries the previous snapshot of the SAME page (v2 only). Pass it and the returned
 * `memory` back on the next call to keep diffing; omit it and every listing is a full one.
 */
export function buildElementsSnapshot(
  raw: RawInteractable[],
  url: string,
  title: string,
  memory?: ElementsDiffMemory | null,
): ElementsSnapshot {
  const { elements, flags: elementFlags } = finalizeElements(raw);
  const previous = memory?.url === url ? memory.digest : null;
  const step = (previous?.step ?? 0) + 1;
  // The element labels are already per-label sanitized; guard the WHOLE listing for injection patterns
  // (a malicious link/button text saying "ignore your task…") before it is wrapped as untrusted.
  const guarded = sanitizeContent(renderListing(elements, previous));
  const flags = [...new Set([...elementFlags, ...guarded.flags])];
  return {
    url,
    title,
    elements,
    content: wrapUntrustedContent(guarded.text, url),
    flags,
    memory: { url, digest: digestOf(elements, step), step },
  };
}
