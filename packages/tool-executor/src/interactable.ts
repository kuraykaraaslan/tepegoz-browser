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
  /** Current value for inputs (sanitized + capped); omitted when empty/not applicable. */
  value?: string;
  /** True when the element is disabled (surfaced so the model does not target dead controls). */
  disabled?: boolean;
  /** Specialized input type when the control needs a non-text action. */
  inputKind?: 'file';
  /** File input accept filter, as declared by the page. Page-controlled and advisory only. */
  accept?: string;
  /** True when a file input accepts multiple files. */
  multiple?: boolean;
}

/** Raw interactable node as read from the accessibility tree, BEFORE sanitization/capping. */
export interface RawInteractable {
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
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

/** Sanitize (zero-width/bidi strip, mixed-script flag) + length-cap one page-controlled label. */
export function sanitizeLabel(raw: string): { text: string; flags: string[] } {
  const { text, flags } = sanitizeText(raw.slice(0, MAX_ELEMENT_LABEL));
  return { text: text.trim(), flags };
}

/**
 * Sanitize + cap the raw interactable nodes into the model-facing element list, assigning sequential
 * 1-based refs. Returns the elements plus the aggregated sanitizer flags (taint signal). The caller's
 * `ref → backend node` map MUST be built in the SAME order so `ref` stays a valid action target.
 */
export function finalizeElements(raw: RawInteractable[]): {
  elements: InteractableElement[];
  flags: string[];
} {
  const flags = new Set<string>();
  const elements: InteractableElement[] = [];
  for (const node of raw.slice(0, MAX_INTERACTABLE_ELEMENTS)) {
    const name = sanitizeLabel(node.name);
    for (const f of name.flags) flags.add(f);
    const el: InteractableElement = { ref: elements.length + 1, role: node.role, name: name.text };
    if (node.value !== undefined && node.value.length > 0) {
      const value = sanitizeLabel(node.value);
      for (const f of value.flags) flags.add(f);
      if (value.text.length > 0) el.value = value.text;
    }
    if (node.disabled === true) el.disabled = true;
    if (node.inputKind === 'file') {
      el.inputKind = 'file';
      if (node.accept !== undefined && node.accept.length > 0) el.accept = sanitizeLabel(node.accept).text;
      if (node.multiple === true) el.multiple = true;
    }
    elements.push(el);
  }
  return { elements, flags: [...flags] };
}

/** Render the interactable elements as a compact, deterministic listing for the model. */
export function renderElementsText(elements: InteractableElement[]): string {
  if (elements.length === 0) return '(no interactable elements found)';
  return elements
    .map((el) => {
      const parts = [`[${String(el.ref)}] ${el.role}`];
      if (el.name.length > 0) parts.push(`"${el.name}"`);
      if (el.value !== undefined) parts.push(`= "${el.value}"`);
      if (el.disabled === true) parts.push('(disabled)');
      if (el.inputKind === 'file') {
        parts.push('(file input)');
        if (el.accept !== undefined) parts.push(`accept="${el.accept}"`);
        if (el.multiple === true) parts.push('multiple');
      }
      return parts.join(' ');
    })
    .join('\n');
}
