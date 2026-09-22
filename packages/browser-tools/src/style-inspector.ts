import { sanitizeContent, wrapUntrustedContent } from '@tepegoz/tool-executor';

/**
 * P3-d — the style/box-model half of the read-only dev-diagnostics trio, behind `browser_get_styles`.
 *
 * `browser_get_console` and `browser_get_network` answer "what did the page log/request"; this answers a
 * different debugging question — "why does THIS element look wrong" (invisible, misplaced, wrong color)
 * — for exactly ONE element the agent already has a `ref` for (from `browser_get_elements`). It is
 * deliberately NOT a general style/DOM dump: a fixed, small property list (display, visibility, opacity,
 * position, zIndex, color, backgroundColor, the box, and a single `visible` verdict) rather than the
 * hundreds of properties `getComputedStyle()` exposes, which is what would actually overlap
 * `browser_get_elements`/`browser_analyze_page` and make this tool a near-duplicate.
 *
 * `read`-class, `CapabilityRegistry`-registered, fenced as untrusted (AI-5) exactly like its siblings:
 * computed values are page-influenced (a page's own CSS decides them), so they are sanitized/capped and
 * XML-wrapped before reaching the model even though the CSS value grammars they come from are narrow.
 * "Not found" is a real, honest result — a stale/unknown ref, or a ref read while the accessibility-tree
 * fallback perception (`TEPEGOZ_PERCEPTION=a11y`) is active and carries no resolvable path — never a
 * fabricated style.
 */

/** The narrow computed-style + box-model read for one element, as the host resolves it. */
export interface StyleProbe {
  display: string;
  visibility: string;
  /** Computed opacity, as `getComputedStyle` reports it (e.g. `"1"`, `"0.5"`, `"0"`). */
  opacity: string;
  position: string;
  /** `"auto"` or an integer, as a string — z-index has no numeric default worth coercing to. */
  zIndex: string;
  color: string;
  backgroundColor: string;
  /** Viewport-relative box, from `getBoundingClientRect()`. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rendered (display/visibility/opacity/non-zero box) AND within the viewport — the same two-part
   *  notion `buildDomTree` (AI-2 perception) uses to decide whether an element is indexable at all. A
   *  `false` here does not say WHICH half failed; `display`/`visibility`/`opacity`/the box say that. */
  visible: boolean;
}

/** The report `browser_get_styles` returns for one `ref`. */
export interface StyleReport {
  ref: number;
  /** `false` means the ref could not be resolved — never a fabricated style. */
  found: boolean;
  visible?: boolean;
  display?: string;
  visibility?: string;
  opacity?: number;
  position?: string;
  zIndex?: string;
  color?: string;
  backgroundColor?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Sanitized, XML-fenced human-readable listing of the properties above — safe to hand to the model. */
  content: string;
}

/** Longest single computed-style value rendered (page-influenced; the CSS grammars behind these
 *  properties are narrow, but every page-sourced string is still capped and sanitized, same as the
 *  console/network siblings). */
const MAX_STYLE_VALUE_CHARS = 200;

/** Sanitize (zero-width/bidi strip + injection redaction, AI-5) and length-cap ONE page-influenced
 *  computed-style value. Applied per-field, not just to the rendered `content` block, so a caller reading
 *  the structured fields directly gets the same guarantee as one reading the text listing. */
function cleanValue(raw: string): string {
  const { text } = sanitizeContent(raw.slice(0, MAX_STYLE_VALUE_CHARS));
  return text;
}

/** `getComputedStyle` opacity as a number, defaulting to fully opaque on a malformed/missing value —
 *  never silently reporting an invisible element as visible because a value could not be parsed. */
function opacityNumber(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 1;
}

/** The sanitized, capped subset of {@link StyleProbe} shared by the structured fields and the rendered
 *  listing, so the two can never disagree about what was cleaned. */
interface CleanedStyle {
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  zIndex: string;
  color: string;
  backgroundColor: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function cleanStyle(probe: StyleProbe): CleanedStyle {
  return {
    display: cleanValue(probe.display),
    visibility: cleanValue(probe.visibility),
    opacity: cleanValue(probe.opacity),
    position: cleanValue(probe.position),
    zIndex: cleanValue(probe.zIndex),
    color: cleanValue(probe.color),
    backgroundColor: cleanValue(probe.backgroundColor),
    x: Math.round(probe.x),
    y: Math.round(probe.y),
    width: Math.round(probe.width),
    height: Math.round(probe.height),
  };
}

function styleLines(clean: CleanedStyle, visible: boolean): string {
  const box = `x=${String(clean.x)} y=${String(clean.y)} width=${String(clean.width)} height=${String(clean.height)}`;
  return [
    `display: ${clean.display}`,
    `visibility: ${clean.visibility}`,
    `opacity: ${clean.opacity}`,
    `position: ${clean.position}`,
    `z-index: ${clean.zIndex}`,
    `color: ${clean.color}`,
    `background-color: ${clean.backgroundColor}`,
    `box: ${box}`,
    `visible: ${visible ? 'yes' : 'no'}`,
  ].join('\n');
}

/**
 * Shape one element's raw {@link StyleProbe} (or `null` when the ref could not be resolved) into the
 * model-facing {@link StyleReport}. Pure and Electron-free, mirroring `summarizeConsole`/`summarizeNetwork`.
 */
export function summarizeStyle(probe: StyleProbe | null, ref: number, pageUrl: string): StyleReport {
  if (probe === null) {
    const { text } = sanitizeContent(
      '(no such element — the ref is stale, unknown, or was read while accessibility-tree fallback ' +
        'perception is active; call browser_get_elements again)',
    );
    return { ref, found: false, content: wrapUntrustedContent(text, pageUrl) };
  }
  const clean = cleanStyle(probe);
  const content = wrapUntrustedContent(styleLines(clean, probe.visible), pageUrl);
  return {
    ref,
    found: true,
    visible: probe.visible,
    display: clean.display,
    visibility: clean.visibility,
    opacity: opacityNumber(clean.opacity),
    position: clean.position,
    zIndex: clean.zIndex,
    color: clean.color,
    backgroundColor: clean.backgroundColor,
    x: clean.x,
    y: clean.y,
    width: clean.width,
    height: clean.height,
    content,
  };
}
