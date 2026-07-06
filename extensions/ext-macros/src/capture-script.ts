import { z } from 'zod';
import type { SelectorChain, Step } from '@tepegoz/shared-types';

/**
 * The Macros extension's passive **recorder** pure half: the in-page capture script (a stringified JS
 * snippet injected by the main process), the capture-payload schema, and the payload→`Step` conversion
 * (including the secret-redaction rule). Electron-free — the main process (`macro-recorder.electron.ts`)
 * injects `CAPTURE_SRC` over CDP and feeds each `Runtime.bindingCalled` payload through {@link toStep}.
 */

/** The `Runtime.addBinding` channel name the injected script posts each interaction to. */
export const BINDING = '__tepegozMacroRecord';

/** The payload the injected capture script posts for each observed interaction. */
export const CaptureSchema = z.object({
  type: z.enum(['click', 'input']),
  id: z.string().optional(),
  css: z.string().optional(),
  xpath: z.string().optional(),
  text: z.string().max(120).optional(),
  attr: z.object({ name: z.string(), value: z.string() }).optional(),
  value: z.string().max(4096).optional(),
  secret: z.boolean().optional(),
});
export type Capture = z.infer<typeof CaptureSchema>;

/** The in-page capture script (stringified). Computes a stable-ish CSS path + XPath + text per target. */
export const CAPTURE_SRC = `(() => {
  if (window.__tepegozRec) return; window.__tepegozRec = true;
  const post = (o) => { try { window.${BINDING}(JSON.stringify(o)); } catch (e) {} };
  const cssPath = (el) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      let s = n.tagName.toLowerCase();
      if (n.classList && n.classList.length) s += '.' + [...n.classList].slice(0,2).map(c => CSS.escape(c)).join('.');
      const p = n.parentNode;
      if (p) { const same = [...p.children].filter(c => c.tagName === n.tagName); if (same.length > 1) s += ':nth-child(' + ([...p.children].indexOf(n)+1) + ')'; }
      parts.unshift(s);
      if (n.id) { parts[0] = '#' + CSS.escape(n.id); break; }
      n = n.parentNode;
    }
    return parts.join(' > ');
  };
  const xpath = (el) => {
    if (el.id) return '//*[@id=' + JSON.stringify(el.id) + ']';
    const seg = [];
    let n = el;
    while (n && n.nodeType === 1) {
      let i = 1, s = n.previousElementSibling;
      while (s) { if (s.tagName === n.tagName) i++; s = s.previousElementSibling; }
      seg.unshift(n.tagName.toLowerCase() + '[' + i + ']');
      n = n.parentElement;
    }
    return '/' + seg.join('/');
  };
  const isSecret = (el) => el && el.tagName === 'INPUT' && (el.type === 'password' || el.autocomplete === 'one-time-code');
  const attrOf = (el) => {
    for (const a of ['data-testid','name','aria-label','placeholder']) { const v = el.getAttribute && el.getAttribute(a); if (v) return { name: a, value: v }; }
    return undefined;
  };
  const describe = (el) => ({ id: el.id || undefined, css: cssPath(el), xpath: xpath(el), text: (el.innerText || el.value || '').trim().slice(0,120) || undefined, attr: attrOf(el) });
  document.addEventListener('click', (e) => { const el = e.target; if (!el || el.nodeType !== 1) return; post(Object.assign({ type: 'click' }, describe(el))); }, true);
  document.addEventListener('change', (e) => { const el = e.target; if (!el || el.nodeType !== 1) return; const secret = isSecret(el); post(Object.assign({ type: 'input', secret, value: secret ? undefined : (el.value || '') }, describe(el))); }, true);
})();`;

/** Build a robust fallback chain from a capture payload (id/css first, then xpath, then attr, then text). */
export function chainFrom(cap: Capture): SelectorChain {
  const chain: SelectorChain = [];
  if (cap.id !== undefined && cap.id.length > 0) chain.push({ kind: 'css', value: `#${cap.id}` });
  if (cap.css !== undefined && cap.css.length > 0) chain.push({ kind: 'css', value: cap.css });
  if (cap.attr !== undefined) chain.push({ kind: 'attr', value: cap.attr.value, attr: cap.attr.name });
  if (cap.xpath !== undefined && cap.xpath.length > 0) chain.push({ kind: 'xpath', value: cap.xpath });
  if (cap.text !== undefined && cap.text.length > 0) chain.push({ kind: 'text', value: cap.text });
  return chain.length > 0 ? chain : [{ kind: 'css', value: 'body' }];
}

/** Convert a capture into a Step, or null to ignore (e.g. an empty selector chain). */
export function toStep(cap: Capture): Step | null {
  const target = chainFrom(cap);
  if (cap.type === 'click') return { kind: 'click', target };
  // A typed value into a secret field is dropped (never inlined) — author re-binds via a variable.
  return { kind: 'fill', target, value: cap.secret === true ? '{{secret}}' : (cap.value ?? '') };
}
