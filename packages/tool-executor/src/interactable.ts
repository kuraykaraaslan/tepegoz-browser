import { sanitizeText } from './content-sanitizer.js';

/**
 * L4 interactable-element model — the perception surface the agent acts on. The (Electron/CDP)
 * perception layer reads the accessibility tree, keeps a `ref → backend node` map for dispatching
 * actions, and hands the interactable nodes here. These pure helpers decide which a11y roles are
 * actionable, sanitize the page-controlled labels (untrusted!), cap the set, and render a compact,
 * model-safe listing. Kept pure so it is unit-testable and Electron-free.
 */

/** One actionable element the agent can target by its stable `ref` (index into the current snapshot). */
export interface InteractableElement {
  /** 1-based index into the CURRENT snapshot; the perception layer maps it back to a DOM node. */
  ref: number;
  /** Accessibility role (button, link, textbox, checkbox, combobox, …). */
  role: string;
  /** Accessible name (sanitized + length-capped — page-controlled, so untrusted). */
  name: string;
  /**
   * HTML tag name (`button`, `a`, `div`, …) when the element came from render-DOM perception
   * (AI-2). Absent for accessibility-tree-only snapshots. Preferred over `role` in serialization
   * because it lets the model reason about unlabelled `div`/`span` click targets.
   */
  tag?: string;
  /**
   * Link destination for anchors (sanitized + capped, page-controlled). Surfaced so the model can
   * reason about where a link goes without clicking it. Render-DOM perception only.
   */
  href?: string;
  /** Current value for inputs (sanitized + capped); omitted when empty/not applicable. */
  value?: string;
  /** True when the element is disabled (surfaced so the model does not target dead controls). */
  disabled?: boolean;
  /**
   * Allow-listed, sanitized page attributes (`aria-*`, `type`, `data-testid`, …) that help the
   * model disambiguate targets. Render-DOM perception only; keys are lower-cased. Untrusted.
   */
  attributes?: Record<string, string>;
  /**
   * True when this element appeared since the previous snapshot of the same page (e.g. a menu the
   * agent just opened). Rendered as a `*` marker. Render-DOM perception only.
   */
  isNew?: boolean;
  /** Specialized input type when the control needs a non-text action. */
  inputKind?: 'file';
  /** File input accept filter, as declared by the page. Page-controlled and advisory only. */
  accept?: string;
  /** True when a file input accepts multiple files. */
  multiple?: boolean;
}

/** Raw interactable node as read from perception (a11y tree or render-DOM), BEFORE sanitization/capping. */
export interface RawInteractable {
  role: string;
  name: string;
  /** HTML tag name (render-DOM perception only). */
  tag?: string;
  /** Link destination for anchors (render-DOM perception only). */
  href?: string;
  value?: string;
  disabled?: boolean;
  /** Raw page attributes captured by the render-DOM script; filtered to {@link ATTR_ALLOWLIST} here. */
  attributes?: Record<string, string>;
  /** Set by the driver when this element is new since the previous same-page snapshot. */
  isNew?: boolean;
  /**
   * The identity-stable ref this element holds for the current page (S2 PR1). Absent ⇒ the legacy
   * positional ref (index + 1). The driver's `ref → node` map MUST be keyed by whichever one is used,
   * or an action resolves to the wrong element.
   */
  ref?: number;
  inputKind?: 'file';
  accept?: string;
  multiple?: boolean;
}

/**
 * ARIA roles the agent may act on. Deliberately conservative: interactive controls the agent can
 * click / fill / toggle. Static/structural roles are excluded — they belong in the text perception
 * (`browser_get_page`), not the actionable set.
 */
export const INTERACTABLE_ROLES: ReadonlySet<string> = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'option',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'MenuItem',
]);

/** True when an a11y role is an interactive control the agent may target. Case-insensitive. */
export function isInteractableRole(role: string): boolean {
  return INTERACTABLE_ROLES.has(role) || INTERACTABLE_ROLES.has(role.toLowerCase());
}

/** Roles that accept typed text (drive `fill`). */
const EDITABLE_ROLES: ReadonlySet<string> = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

/** True when the element accepts typed text (so the agent can `fill` it). */
export function isEditableRole(role: string): boolean {
  return EDITABLE_ROLES.has(role.toLowerCase());
}

/** Max actionable elements surfaced to the model (hostile-page DoS guard + keeps the prompt bounded). */
export const MAX_INTERACTABLE_ELEMENTS = 200;
/** Max characters kept from any single page-controlled label/value. */
export const MAX_ELEMENT_LABEL = 200;
/** Max characters kept from any single attribute value (attrs are noisier than labels — cap tighter). */
export const MAX_ATTR_VALUE = 100;

/**
 * Page attributes worth surfacing to the model from render-DOM perception (AI-2). Deliberately small:
 * disambiguating signals the model can reason about, not the whole attribute soup. `href` is handled
 * as its own field. Keep in sync with the in-page `buildDomTree` capture list. All lower-cased.
 */
export const ATTR_ALLOWLIST: ReadonlySet<string> = new Set([
  'type',
  'name',
  'placeholder',
  'title',
  'alt',
  'role',
  'aria-label',
  'aria-expanded',
  'aria-haspopup',
  'aria-selected',
  'aria-checked',
  'data-testid',
  // AI-4 s16 validation attributes: let the model + the form checker see a field's constraints and any
  // page-flagged invalid state (required is surfaced by the page script from the boolean DOM property).
  'required',
  'aria-required',
  'aria-invalid',
  'pattern',
  'minlength',
  'maxlength',
  'min',
  'max',
  'autocomplete',
  'inputmode',
]);

/** Filter → sanitize → cap a raw attribute map down to the allow-listed, model-safe subset. */
function finalizeAttributes(
  raw: Record<string, string> | undefined,
  flags: Set<string>,
): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = key.toLowerCase();
    if (!ATTR_ALLOWLIST.has(name)) continue;
    const { text, flags: f } = sanitizeText(value.slice(0, MAX_ATTR_VALUE));
    for (const flag of f) flags.add(flag);
    const trimmed = text.trim();
    if (trimmed.length > 0) out[name] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Sanitize (zero-width/bidi strip, mixed-script flag) + length-cap one page-controlled label. */
export function sanitizeLabel(raw: string): { text: string; flags: string[] } {
  const { text, flags } = sanitizeText(raw.slice(0, MAX_ELEMENT_LABEL));
  return { text: text.trim(), flags };
}

/** Sanitize one optional page-controlled string, accumulating flags; '' when absent/empty. */
function cleanInto(raw: string | undefined, flags: Set<string>): string {
  if (raw === undefined || raw.length === 0) return '';
  const { text, flags: f } = sanitizeLabel(raw);
  for (const flag of f) flags.add(flag);
  return text;
}

/** Build one sanitized model-facing element from a raw node at 1-based `ref`. */
function finalizeNode(node: RawInteractable, ref: number, flags: Set<string>): InteractableElement {
  const el: InteractableElement = { ref: node.ref ?? ref, role: node.role, name: cleanInto(node.name, flags) };
  if (node.tag !== undefined && node.tag.length > 0) el.tag = node.tag.toLowerCase();
  const href = cleanInto(node.href, flags);
  if (href.length > 0) el.href = href;
  const value = cleanInto(node.value, flags);
  if (value.length > 0) el.value = value;
  const attributes = finalizeAttributes(node.attributes, flags);
  if (attributes !== undefined) el.attributes = attributes;
  if (node.isNew === true) el.isNew = true;
  if (node.disabled === true) el.disabled = true;
  if (node.inputKind === 'file') {
    el.inputKind = 'file';
    const accept = cleanInto(node.accept, flags);
    if (accept.length > 0) el.accept = accept;
    if (node.multiple === true) el.multiple = true;
  }
  return el;
}

/**
 * Sanitize + cap the raw interactable nodes into the model-facing element list. A node that carries its
 * own identity-stable `ref` (S2 PR1) keeps it; otherwise refs are sequential 1-based positions. Returns
 * the elements plus the aggregated sanitizer flags (taint signal). The caller's `ref → backend node` map
 * MUST be keyed by whichever ref was used, or an action resolves to the wrong element.
 */
export function finalizeElements(raw: RawInteractable[]): {
  elements: InteractableElement[];
  flags: string[];
} {
  const flags = new Set<string>();
  const elements = raw
    .slice(0, MAX_INTERACTABLE_ELEMENTS)
    .map((node, i) => finalizeNode(node, i + 1, flags));
  return { elements, flags: [...flags] };
}

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
  return elements
    .map((el) => (el.tag !== undefined && el.tag.length > 0 ? renderTagged(el, el.tag) : renderLegacy(el)))
    .join('\n');
}
