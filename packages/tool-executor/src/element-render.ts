import type { InteractableElement } from './interactable.js';

/**
 * How an interactable element is written down for the model (split out of `interactable.ts` under the
 * ADR-0010 file-size cap). Three formats, one per perception source and economy:
 *
 * - **pseudo-HTML** — the render-DOM default: `[3]<button role="…">Accept</button>`.
 * - **legacy** — the accessibility-tree fallback, which has no tag to render: `[3] button "Accept"`.
 * - **TSV** — perception v2 (S2): one row per element, each column named once in the header.
 *
 * Every one of these embeds page-controlled strings, so callers wrap the result as untrusted before
 * it reaches a model; the sanitizing itself happened upstream, in `finalizeElements`.
 */

/** Implicit ARIA role of a standard tag, so an explicit `role=` is shown only when it overrides. */
const IMPLICIT_ROLE: Record<string, string> = {
  a: 'link',
  button: 'button',
  input: 'textbox',
  textarea: 'textbox',
  select: 'combobox',
};

/** The ref token, prefixed with `*` when the element is new since the previous same-page snapshot. */
function refToken(el: InteractableElement): string {
  return `${el.isNew === true ? '*' : ''}[${String(el.ref)}]`;
}

/** Trailing annotations shared by both render formats (value / disabled / file input). */
function elementAnnotations(el: InteractableElement): string[] {
  const parts: string[] = [];
  if (el.value !== undefined) parts.push(`= "${el.value}"`);
  if (el.disabled === true) parts.push('(disabled)');
  if (el.inputKind === 'file') {
    parts.push('(file input)');
    if (el.accept !== undefined) parts.push(`accept="${el.accept}"`);
    if (el.multiple === true) parts.push('multiple');
  }
  return parts;
}

/** Render-DOM (AI-2) format: `[ref]<tag role=… href=… attr=…>name</tag>` (pseudo-HTML, model-friendly). */
function renderTagged(el: InteractableElement, tag: string): string {
  const attrs: string[] = [];
  if (el.role.length > 0 && el.role !== (IMPLICIT_ROLE[tag] ?? '')) attrs.push(`role="${el.role}"`);
  if (el.href !== undefined) attrs.push(`href="${el.href}"`);
  for (const [key, value] of Object.entries(el.attributes ?? {})) attrs.push(`${key}="${value}"`);
  const open = attrs.length > 0 ? `${tag} ${attrs.join(' ')}` : tag;
  const body =
    el.name.length > 0 ? `<${open}>${el.name}</${tag}>` : `<${open} />`;
  return [`${refToken(el)}${body}`, ...elementAnnotations(el)].join(' ');
}

/** Accessibility-tree (legacy/fallback) format: `[ref] role "name"`. */
function renderLegacy(el: InteractableElement): string {
  const parts = [`${refToken(el)} ${el.role}`];
  if (el.name.length > 0) parts.push(`"${el.name}"`);
  return [...parts, ...elementAnnotations(el)].join(' ');
}

/** Render the interactable elements as a compact, deterministic listing for the model. */
export function renderElementsText(elements: InteractableElement[]): string {
  if (elements.length === 0) return '(no interactable elements found)';
  return elements.map(renderElement).join('\n');
}

/** One element in whichever format its perception source justifies. */
export function renderElement(el: InteractableElement): string {
  return el.tag !== undefined && el.tag.length > 0 ? renderTagged(el, el.tag) : renderLegacy(el);
}

/** Column order for the compact tabular listing. Emitted once, as a header row. */
export const TSV_HEADER = 'ref\ttag\trole\tname\thref\tstate';

/**
 * Compact tabular (TSV) rendering of one element (S2 PR2).
 *
 * The pseudo-HTML form repeats `<tag …>` and `</tag>` and every attribute name on every row; a table
 * states each column once, in the header. Prior art (browser-use) measured roughly a 40% token cut from
 * this shape — a number we do NOT inherit: our own token delta is measured on our own pages, by the
 * funded sweep, through the existing cost plumbing.
 *
 * Tabs and newlines are stripped from page-controlled values: a tab inside a cell would let a page
 * forge columns in the very listing the model reads.
 */
export function renderElementTsv(el: InteractableElement): string {
  const cell = (v: string): string => v.replace(/[\t\n\r]+/g, ' ');
  const state: string[] = [];
  if (el.value !== undefined) state.push(`value="${cell(el.value)}"`);
  if (el.disabled === true) state.push('disabled');
  if (el.inputKind === 'file') {
    state.push('file');
    if (el.accept !== undefined) state.push(`accept="${cell(el.accept)}"`);
    if (el.multiple === true) state.push('multiple');
  }
  for (const [key, value] of Object.entries(el.attributes ?? {})) state.push(`${key}="${cell(value)}"`);
  return [
    refToken(el),
    el.tag ?? '',
    el.role,
    cell(el.name),
    cell(el.href ?? ''),
    state.join(' '),
  ].join('\t');
}
