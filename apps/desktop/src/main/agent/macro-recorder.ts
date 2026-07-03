import { z } from 'zod';
import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import type { SelectorChain, Step } from '@tepegoz/shared-types';

/**
 * Passive **macro recorder**: turns a human demonstration into deterministic {@link Step}s. It injects
 * a small capture script (via `Page.addScriptToEvaluateOnNewDocument`, so it survives navigations) that
 * listens for clicks/typing and reports the target's computed selectors back over a
 * `Runtime.addBinding` channel. The main side assembles a robust {@link SelectorChain} (id/css + xpath
 * + text) per action — the record-time half of the "static TAG breaks on React" fix. Values typed into
 * password/secret inputs are dropped (never inlined) — the redaction rule.
 *
 * NOTE: the capture script runs in the page's main world for simplicity; moving it to an isolated
 * world (like Chrome DevTools Recorder) is a hardening follow-up. Only a user-initiated "Record" starts
 * it, and it is read-only (it observes events; it never acts).
 */

const BINDING = '__tepegozMacroRecord';

/** The payload the injected capture script posts for each observed interaction. */
const CaptureSchema = z.object({
  type: z.enum(['click', 'input']),
  id: z.string().optional(),
  css: z.string().optional(),
  xpath: z.string().optional(),
  text: z.string().max(120).optional(),
  attr: z.object({ name: z.string(), value: z.string() }).optional(),
  value: z.string().max(4096).optional(),
  secret: z.boolean().optional(),
});
type Capture = z.infer<typeof CaptureSchema>;

/** The in-page capture script (stringified). Computes a stable-ish CSS path + XPath + text per target. */
const CAPTURE_SRC = `(() => {
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
function chainFrom(cap: Capture): SelectorChain {
  const chain: SelectorChain = [];
  if (cap.id !== undefined && cap.id.length > 0) chain.push({ kind: 'css', value: `#${cap.id}` });
  if (cap.css !== undefined && cap.css.length > 0) chain.push({ kind: 'css', value: cap.css });
  if (cap.attr !== undefined) chain.push({ kind: 'attr', value: cap.attr.value, attr: cap.attr.name });
  if (cap.xpath !== undefined && cap.xpath.length > 0) chain.push({ kind: 'xpath', value: cap.xpath });
  if (cap.text !== undefined && cap.text.length > 0) chain.push({ kind: 'text', value: cap.text });
  return chain.length > 0 ? chain : [{ kind: 'css', value: 'body' }];
}

/** Convert a capture into a Step, or null to ignore (e.g. an empty selector chain). */
function toStep(cap: Capture): Step | null {
  const target = chainFrom(cap);
  if (cap.type === 'click') return { kind: 'click', target };
  // A typed value into a secret field is dropped (never inlined) — author re-binds via a variable.
  return { kind: 'fill', target, value: cap.secret === true ? '{{secret}}' : (cap.value ?? '') };
}

export default class MacroRecorder {
  private static active: { wc: WebContents; scriptId?: string; onStep: (step: Step) => void } | null =
    null;

  /** Start recording on `wc`; `onStep` is invoked for each captured Step. One recording at a time. */
  static async start(wc: WebContents, onStep: (step: Step) => void): Promise<void> {
    if (MacroRecorder.active !== null) throw new AppError('A recording is already in progress', 409);
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Runtime.enable');
    await wc.debugger.sendCommand('Page.enable');
    await wc.debugger.sendCommand('Runtime.addBinding', { name: BINDING });

    const listener = (_e: unknown, method: string, params?: unknown): void => {
      if (method !== 'Runtime.bindingCalled') return;
      const parsed = z
        .object({ name: z.string(), payload: z.string() })
        .safeParse(params);
      if (!parsed.success || parsed.data.name !== BINDING) return;
      let cap: Capture | null = null;
      try {
        cap = CaptureSchema.parse(JSON.parse(parsed.data.payload));
      } catch {
        return;
      }
      const step = toStep(cap);
      if (step !== null) onStep(step);
    };
    wc.debugger.on('message', listener);

    const res: unknown = await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: CAPTURE_SRC,
    });
    const scriptId = z.object({ identifier: z.string() }).safeParse(res);
    // Also inject into the already-loaded page so recording works without a reload.
    await wc.debugger.sendCommand('Runtime.evaluate', { expression: CAPTURE_SRC }).catch(() => undefined);

    MacroRecorder.active = {
      wc,
      onStep,
      ...(scriptId.success ? { scriptId: scriptId.data.identifier } : {}),
    };
    // Keep the listener reachable for stop().
    MacroRecorder.listeners.set(wc, listener);
  }

  private static readonly listeners = new Map<
    WebContents,
    (e: unknown, method: string, params?: unknown) => void
  >();

  /** Stop the active recording (best-effort teardown). */
  static async stop(): Promise<void> {
    const active = MacroRecorder.active;
    if (active === null) return;
    MacroRecorder.active = null;
    const { wc, scriptId } = active;
    const listener = MacroRecorder.listeners.get(wc);
    if (listener !== undefined) {
      wc.debugger.removeListener('message', listener);
      MacroRecorder.listeners.delete(wc);
    }
    if (wc.isDestroyed() || !wc.debugger.isAttached()) return;
    try {
      if (scriptId !== undefined) {
        await wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: scriptId,
        });
      }
      await wc.debugger.sendCommand('Runtime.removeBinding', { name: BINDING });
    } catch (err) {
      Logger.warn('macro recorder teardown failed', { err: String(err) });
    }
  }
}
