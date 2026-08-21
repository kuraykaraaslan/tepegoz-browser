import { type WebContents } from 'electron';
import {
  BINDING,
  MAX_ITEM_CHARS,
  MAX_PAGE_ITEMS,
  makeBindingListener,
  type BindingListener,
} from './translate-page-injector-binding.electron';

export const TRANSLATE_PAGE_SCRIPT = `
(() => {
  if (window.__tepegozTranslateInstalled === true) return;
  window.__tepegozTranslateInstalled = true;

  let seq = 0;
  let active = false;
  let timer = 0;
  let observer = null;
  let lastConfig = null;
  let state = {
    status: 'idle',
    sourceLanguage: '',
    targetLanguage: '',
    translatedItems: 0,
    totalItems: 0,
    engine: 'none',
    error: null
  };
  const textOriginals = new Map();
  const attrOriginals = new Map();
  const pendingRefs = new Map();
  const BAD_ATTR_ANCESTORS = 'script, style, noscript, template, svg, math, pre, code, textarea, select, [contenteditable="true"], [contenteditable=""], .monaco-editor, .cm-editor, .CodeMirror';
  const SKIP_SELECTOR = '[translate="no"], [data-tepegoz-translate="off"], [aria-hidden="true"]';
  const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];
  const BUTTON_TYPES = new Set(['button', 'submit', 'reset']);

  function lang() {
    return (document.documentElement.getAttribute('lang') || document.body?.getAttribute('lang') || navigator.language || '').slice(0, 16);
  }

  function origin() {
    try { return location.origin; } catch { return ''; }
  }

  function closest(el, selector) {
    return el instanceof Element ? el.closest(selector) : null;
  }

  function skippedElement(el) {
    if (!(el instanceof Element)) return true;
    if (closest(el, SKIP_SELECTOR) !== null) return true;
    if (closest(el, BAD_ATTR_ANCESTORS) !== null) return true;
    return false;
  }

  function visible(el) {
    if (!(el instanceof Element)) return false;
    const rects = el.getClientRects();
    if (rects.length === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }

  function textNodeVisible(node) {
    const parent = node.parentElement;
    if (parent === null || skippedElement(parent) || !visible(parent)) return false;
    const value = node.nodeValue || '';
    return value.trim().length >= 2;
  }

  function attrAllowed(el, attr) {
    if (skippedElement(el) || !visible(el)) return false;
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      if (attr === 'value') return BUTTON_TYPES.has(type);
      return BUTTON_TYPES.has(type) || type === 'image';
    }
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return false;
    return true;
  }

  function attrOriginal(el, attr) {
    return attr === 'value' && el instanceof HTMLInputElement ? el.value : el.getAttribute(attr);
  }

  function setAttr(el, attr, value) {
    if (attr === 'value' && el instanceof HTMLInputElement) el.value = value;
    else el.setAttribute(attr, value);
  }

  function collect() {
    const refs = new Map();
    const items = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return textNodeVisible(node) && !textOriginals.has(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    while (items.length < ${MAX_PAGE_ITEMS}) {
      const node = walker.nextNode();
      if (node === null) break;
      const text = (node.nodeValue || '').slice(0, ${MAX_ITEM_CHARS});
      const id = 't' + (++seq);
      refs.set(id, { kind: 'text', node, original: node.nodeValue || '' });
      items.push({ id, text });
    }
    const elements = document.body?.querySelectorAll('*') || [];
    for (const el of elements) {
      if (items.length >= ${MAX_PAGE_ITEMS}) break;
      if (!(el instanceof HTMLElement) || skippedElement(el) || !visible(el)) continue;
      const attrs = el instanceof HTMLInputElement && BUTTON_TYPES.has((el.type || '').toLowerCase())
        ? ['value', ...ATTRS]
        : ATTRS;
      for (const attr of attrs) {
        if (items.length >= ${MAX_PAGE_ITEMS}) break;
        if (!attrAllowed(el, attr)) continue;
        const value = attrOriginal(el, attr);
        if (value === null || value.trim().length < 2 || value.length > ${MAX_ITEM_CHARS}) continue;
        const existing = attrOriginals.get(el);
        if (existing !== undefined && existing.has(attr)) continue;
        const id = 'a' + (++seq);
        refs.set(id, { kind: 'attr', el, attr, original: value });
        items.push({ id, text: value });
      }
    }
    return { refs, items };
  }

  function apply(ref, translatedText) {
    if (typeof translatedText !== 'string' || translatedText.trim().length === 0) return false;
    if (ref.kind === 'text') {
      if (!textOriginals.has(ref.node)) textOriginals.set(ref.node, ref.original);
      ref.node.nodeValue = translatedText;
      return true;
    }
    let attrs = attrOriginals.get(ref.el);
    if (attrs === undefined) {
      attrs = new Map();
      attrOriginals.set(ref.el, attrs);
    }
    if (!attrs.has(ref.attr)) attrs.set(ref.attr, ref.original);
    setAttr(ref.el, ref.attr, translatedText);
    return true;
  }

  function dispatchState() {
    window.dispatchEvent(new CustomEvent('tepegoz-translate-state', { detail: window.__tepegozTranslateState() }));
  }

  function schedule() {
    if (!active || lastConfig === null) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => window.__tepegozTranslateStart(lastConfig), 900);
  }

  function ensureObserver() {
    if (observer !== null) return;
    observer = new MutationObserver(() => schedule());
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  window.__tepegozTranslateStart = (config) => {
    if (typeof window.__tepegozTranslatePost !== 'function') return window.__tepegozTranslateState();
    active = true;
    lastConfig = Object.assign({}, config || {});
    const requestId = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
    const collected = collect();
    if (collected.items.length === 0) {
      state = Object.assign({}, state, {
        status: 'translated',
        sourceLanguage: String(lastConfig.sourceLanguage || lang()),
        targetLanguage: String(lastConfig.targetLanguage || ''),
        totalItems: 0,
        translatedItems: 0,
        error: null
      });
      dispatchState();
      ensureObserver();
      return window.__tepegozTranslateState();
    }
    pendingRefs.set(requestId, collected.refs);
    state = {
      status: 'translating',
      sourceLanguage: String(lastConfig.sourceLanguage || lang()),
      targetLanguage: String(lastConfig.targetLanguage || ''),
      translatedItems: 0,
      totalItems: collected.items.length,
      engine: 'none',
      error: null
    };
    dispatchState();
    window.__tepegozTranslatePost(JSON.stringify({
      requestId,
      items: collected.items,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
      origin: String(lastConfig.origin || origin()),
      reason: lastConfig.reason || 'page'
    }));
    ensureObserver();
    return window.__tepegozTranslateState();
  };

  window.__tepegozTranslateReceive = (message) => {
    const requestId = String(message && message.requestId || '');
    const refs = pendingRefs.get(requestId);
    if (refs === undefined) return false;
    pendingRefs.delete(requestId);
    let translated = 0;
    const items = Array.isArray(message.result?.items) ? message.result.items : [];
    for (const item of items) {
      const ref = refs.get(String(item.id));
      if (ref !== undefined && apply(ref, String(item.translatedText || ''))) translated += 1;
    }
    state = {
      status: 'translated',
      sourceLanguage: String(message.result?.sourceLanguage || state.sourceLanguage),
      targetLanguage: String(message.result?.targetLanguage || state.targetLanguage),
      translatedItems: translated,
      totalItems: refs.size,
      engine: String(message.result?.engine || 'none'),
      error: null
    };
    dispatchState();
    return true;
  };

  window.__tepegozTranslateRestore = () => {
    for (const [node, original] of textOriginals.entries()) node.nodeValue = original;
    for (const [el, attrs] of attrOriginals.entries()) {
      for (const [attr, original] of attrs.entries()) setAttr(el, attr, original);
    }
    textOriginals.clear();
    attrOriginals.clear();
    pendingRefs.clear();
    active = false;
    state = Object.assign({}, state, { status: 'restored', translatedItems: 0, totalItems: 0, engine: 'none', error: null });
    dispatchState();
    return window.__tepegozTranslateState();
  };

  window.__tepegozTranslateState = () => Object.assign({}, state, {
    url: location.href,
    origin: origin(),
    updatedAt: Date.now()
  });
})();
`;

const listeners = new WeakMap<WebContents, BindingListener>();

async function ensureBinding(wc: WebContents): Promise<void> {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Runtime.enable');
  await wc.debugger.sendCommand('Runtime.addBinding', { name: BINDING }).catch(() => undefined);
  if (listeners.has(wc)) return;
  const listener = makeBindingListener(wc);
  listeners.set(wc, listener);
  wc.debugger.on('message', listener);
  wc.once('destroyed', () => {
    const installed = listeners.get(wc);
    if (installed !== undefined) {
      // The wc is already gone here — its native debugger/message listener is torn down with it.
      // Touching wc.debugger on a destroyed WebContents throws "Object has been destroyed".
      if (!wc.isDestroyed()) wc.debugger.removeListener('message', installed);
      listeners.delete(wc);
    }
  });
}

export async function inject(wc: WebContents): Promise<void> {
  await ensureBinding(wc);
  await wc.executeJavaScript(TRANSLATE_PAGE_SCRIPT, true);
}
