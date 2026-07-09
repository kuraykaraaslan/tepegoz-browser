import { z } from 'zod';
import { nativeTheme, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from '../tabs';
import typoHost from './typo-host.electron';

const BINDING = '__tepegozTypoPost';
const LIGHT_PRIMARY = '#06AEC4';
const DARK_PRIMARY = '#22C6DA';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const BindingPayloadSchema = z.object({
  requestId: z.string().min(1).max(64),
  text: z.string().min(1).max(50_000),
  language: z.string().min(1).max(16).optional(),
});

const DebuggerPayloadSchema = z.object({
  name: z.string(),
  payload: z.string(),
});

const TYPO_CSS = `
.tepegoz-typo-mirror {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  background: transparent !important;
  color: transparent !important;
  caret-color: transparent !important;
  overflow: hidden !important;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-wrap: break-word;
}
.tepegoz-typo-mirror-input {
  white-space: pre;
}
.tepegoz-typo-word {
  color: transparent !important;
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--tepegoz-typo-underline, #06AEC4);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}
.tepegoz-typo-line {
  position: fixed;
  z-index: 2147483646;
  height: 3px;
  pointer-events: none;
  background-image: radial-gradient(circle at 2px 2px, var(--tepegoz-typo-underline, #06AEC4) 1.2px, transparent 1.4px);
  background-size: 6px 3px;
  background-repeat: repeat-x;
}
.tepegoz-typo-popover {
  position: fixed;
  z-index: 2147483647;
  max-width: min(360px, calc(100vw - 24px));
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 8px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.24);
  padding: 8px;
  font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.tepegoz-typo-popover strong { font-weight: 650; }
.tepegoz-typo-popover button {
  margin: 6px 4px 0 0;
  border: 1px solid rgba(148, 163, 184, 0.55);
  border-radius: 6px;
  background: ButtonFace;
  color: ButtonText;
  padding: 3px 6px;
  font: inherit;
}
`;

const TYPO_SCRIPT = `
(() => {
  if (window.__tepegozTypoInstalled === true) return;
  window.__tepegozTypoInstalled = true;
  let current = null;
  let lastRequestId = '';
  let timer = 0;
  let popover = null;
  let mirror = null;
  let mirrorCleanup = null;
  let contentMarks = [];
  let lastResult = null;
  let lastIssues = [];
  let issueRects = [];
  let lastLanguage = '';
  let rerenderTimer = 0;
  const BAD_TYPES = new Set(['password', 'hidden', 'file', 'button', 'submit', 'reset']);
  const PAYMENT_RE = /(credit|card|cc-|cc_|cvv|cvc|iban|routing|account|payment|expiry|expire|security)/i;

  function closest(el, selector) {
    return el instanceof Element ? el.closest(selector) : null;
  }

  function isCodeLike(el) {
    return closest(el, 'pre, code, [role="code"], .monaco-editor, .cm-editor, .CodeMirror') !== null;
  }

  function attrBag(el) {
    return [
      el.getAttribute('name') || '',
      el.getAttribute('id') || '',
      el.getAttribute('autocomplete') || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || ''
    ].join(' ');
  }

  function editable(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (closest(el, '[data-tepegoz-typo="off"]') !== null) return false;
    if (isCodeLike(el)) return false;
    if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
    if (el instanceof HTMLInputElement) {
      const type = (el.type || 'text').toLowerCase();
      if (BAD_TYPES.has(type) || el.readOnly || el.disabled) return false;
      if (PAYMENT_RE.test(attrBag(el))) return false;
      return ['text', 'search', 'url', 'email', 'tel'].includes(type);
    }
    return el.isContentEditable && !PAYMENT_RE.test(attrBag(el));
  }

  function textOf(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
    return el.textContent || '';
  }

  function setText(el, text) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = text;
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
  }

  function clearDecorations() {
    if (mirrorCleanup !== null) mirrorCleanup();
    mirrorCleanup = null;
    if (mirror !== null) mirror.remove();
    mirror = null;
    for (const mark of contentMarks) mark.remove();
    contentMarks = [];
    issueRects = [];
  }

  function clearPopover() {
    if (popover !== null) popover.remove();
    popover = null;
  }

  function hidePopover() {
    clearPopover();
    clearDecorations();
    lastResult = null;
    lastIssues = [];
    lastLanguage = '';
  }

  function requestCheck(el) {
    const text = textOf(el);
    if (text.trim().length < 2 || text.length > 50000 || typeof window.__tepegozTypoPost !== 'function') {
      hidePopover();
      return;
    }
    current = el;
    lastRequestId = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
    window.__tepegozTypoPost(JSON.stringify({ requestId: lastRequestId, text }));
  }

  function schedule(el) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => requestCheck(el), 650);
  }

  function applySuggestion(issue, suggestion) {
    applyReplacement(issue.start, issue.end, suggestion);
  }

  function applyReplacement(start, end, suggestion) {
    if (current === null) return;
    const text = textOf(current);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
    if (start < 0 || end > text.length || end <= start || typeof suggestion !== 'string') return false;
    setText(current, text.slice(0, start) + suggestion + text.slice(end));
    if (current instanceof HTMLInputElement || current instanceof HTMLTextAreaElement) {
      const pos = start + suggestion.length;
      current.setSelectionRange(pos, pos);
    }
    schedule(current);
    return true;
  }

  function normalizedIssues(rawIssues, text) {
    if (!Array.isArray(rawIssues)) return [];
    const out = [];
    for (const issue of rawIssues) {
      const start = Number(issue && issue.start);
      const end = Number(issue && issue.end);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      if (start < 0 || end <= start || end > text.length) continue;
      out.push(Object.assign({}, issue, { start, end }));
    }
    out.sort((a, b) => a.start - b.start || a.end - b.end);
    const clean = [];
    let lastEnd = -1;
    for (const issue of out) {
      if (issue.start < lastEnd) continue;
      clean.push(issue);
      lastEnd = issue.end;
    }
    return clean;
  }

  function appendIssueText(container, text, issues) {
    let cursor = 0;
    for (let index = 0; index < issues.length; index += 1) {
      const issue = issues[index];
      if (issue.start > cursor) container.appendChild(document.createTextNode(text.slice(cursor, issue.start)));
      const span = document.createElement('span');
      span.className = 'tepegoz-typo-word';
      span.dataset.tepegozTypoIssueIndex = String(index);
      span.textContent = text.slice(issue.start, issue.end);
      container.appendChild(span);
      cursor = issue.end;
    }
    if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function copyMirrorStyle(el, box) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const props = [
      'boxSizing',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'fontVariant',
      'lineHeight',
      'letterSpacing',
      'textAlign',
      'textTransform',
      'textIndent',
      'wordSpacing',
      'tabSize',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'borderTopStyle',
      'borderRightStyle',
      'borderBottomStyle',
      'borderLeftStyle',
      'borderRadius'
    ];
    for (const prop of props) box.style[prop] = style[prop];
    box.style.borderColor = 'transparent';
    box.style.top = rect.top + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
  }

  function rememberRect(index, rect) {
    if (!Number.isInteger(index) || rect.width <= 0 || rect.height <= 0) return;
    issueRects.push({
      index,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    });
  }

  function decorateFormControl(el, issues) {
    const text = textOf(el);
    mirror = document.createElement('div');
    mirror.className =
      'tepegoz-typo-mirror' + (el instanceof HTMLInputElement ? ' tepegoz-typo-mirror-input' : '');
    copyMirrorStyle(el, mirror);
    appendIssueText(mirror, text, issues);
    document.documentElement.appendChild(mirror);
    const sync = () => {
      if (mirror === null) return;
      mirror.scrollTop = el.scrollTop;
      mirror.scrollLeft = el.scrollLeft;
      copyMirrorStyle(el, mirror);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    mirrorCleanup = () => {
      el.removeEventListener('scroll', sync);
    };
    const spans = mirror.querySelectorAll('.tepegoz-typo-word');
    for (const span of spans) {
      const index = Number(span.dataset.tepegozTypoIssueIndex);
      rememberRect(index, span.getBoundingClientRect());
    }
    return spans[0]?.getBoundingClientRect() || null;
  }

  function rangeForOffsets(root, start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startNode = null;
    let endNode = null;
    let startOffset = 0;
    let endOffset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const next = offset + node.nodeValue.length;
      if (startNode === null && start >= offset && start <= next) {
        startNode = node;
        startOffset = start - offset;
      }
      if (endNode === null && end >= offset && end <= next) {
        endNode = node;
        endOffset = end - offset;
        break;
      }
      offset = next;
    }
    if (startNode === null || endNode === null) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function decorateContentEditable(el, issues) {
    let firstRect = null;
    for (let index = 0; index < issues.length; index += 1) {
      const issue = issues[index];
      const range = rangeForOffsets(el, issue.start, issue.end);
      if (range === null) continue;
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (firstRect === null) firstRect = rect;
        rememberRect(index, rect);
        const line = document.createElement('div');
        line.className = 'tepegoz-typo-line';
        line.dataset.tepegozTypoIssueIndex = String(index);
        line.style.left = rect.left + 'px';
        line.style.top = Math.max(0, rect.bottom - 3) + 'px';
        line.style.width = rect.width + 'px';
        document.documentElement.appendChild(line);
        contentMarks.push(line);
      }
    }
    return firstRect;
  }

  function issueAtPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const tolerance = 4;
    for (let i = issueRects.length - 1; i >= 0; i -= 1) {
      const rect = issueRects[i];
      if (
        x >= rect.left - tolerance &&
        x <= rect.right + tolerance &&
        y >= rect.top - tolerance &&
        y <= rect.bottom + tolerance
      ) {
        return lastIssues[rect.index] || null;
      }
    }
    return null;
  }

  function publicIssue(issue) {
    if (current === null) return null;
    const text = textOf(current);
    const suggestions = Array.isArray(issue.suggestions)
      ? issue.suggestions.map((value) => String(value)).filter(Boolean).slice(0, 8)
      : [];
    return {
      text: String(issue.text || text.slice(issue.start, issue.end)),
      start: issue.start,
      end: issue.end,
      language: String(issue.language || lastLanguage || ''),
      suggestions
    };
  }

  function decorateIssues(el, issues) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return decorateFormControl(el, issues);
    }
    return decorateContentEditable(el, issues);
  }

  function positionPopover(anchorRect, fallbackRect) {
    if (popover === null) return;
    const rect = anchorRect || fallbackRect;
    const top = Math.min(window.innerHeight - popover.offsetHeight - 8, rect.bottom + 6);
    const left = Math.min(window.innerWidth - popover.offsetWidth - 8, Math.max(8, rect.left));
    popover.style.top = Math.max(8, top) + 'px';
    popover.style.left = left + 'px';
  }

  function render(result) {
    if (current === null || !editable(current)) return;
    const text = textOf(current);
    const issues = normalizedIssues(result.issues, text);
    clearPopover();
    clearDecorations();
    lastResult = result;
    lastIssues = issues;
    lastLanguage = String(result.language || '');
    if (issues.length === 0) {
      lastResult = null;
      lastIssues = [];
      lastLanguage = '';
      return;
    }
    const first = issues[0];
    const rect = current.getBoundingClientRect();
    const anchorRect = decorateIssues(current, issues);
    popover = document.createElement('div');
    popover.className = 'tepegoz-typo-popover';
    const title = document.createElement('div');
    const word = document.createElement('strong');
    word.textContent = String(first.text || text.slice(first.start, first.end) || 'Typo');
    title.appendChild(word);
    title.appendChild(document.createTextNode(': ' + String(first.message || '')));
    popover.appendChild(title);
    for (const suggestion of (first.suggestions || []).slice(0, 4)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => applySuggestion(first, suggestion));
      popover.appendChild(button);
    }
    document.documentElement.appendChild(popover);
    positionPopover(anchorRect, rect);
  }

  function rerender() {
    if (current === null || lastResult === null) return;
    window.clearTimeout(rerenderTimer);
    rerenderTimer = window.setTimeout(() => {
      if (current !== null && lastResult !== null && editable(current)) render(lastResult);
    }, 50);
  }

  window.__tepegozTypoReceive = (payload) => {
    if (!payload || payload.requestId !== lastRequestId) return;
    render(payload.result || {});
  };

  window.__tepegozTypoIssueAt = (x, y) => {
    if (current === null || !editable(current)) return null;
    const issue = issueAtPoint(Number(x), Number(y));
    if (issue === null) return null;
    const exposed = publicIssue(issue);
    if (exposed === null || exposed.suggestions.length === 0) return null;
    return exposed;
  };

  window.__tepegozTypoApplySuggestion = (payload) => {
    if (current === null || !editable(current) || payload === null || typeof payload !== 'object') {
      return false;
    }
    return applyReplacement(
      Number(payload.start),
      Number(payload.end),
      String(payload.suggestion || '')
    ) === true;
  };

  document.addEventListener('focusin', (event) => {
    if (editable(event.target)) schedule(event.target);
  }, true);
  document.addEventListener('input', (event) => {
    if (editable(event.target)) schedule(event.target);
  }, true);
  document.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!document.activeElement || !editable(document.activeElement)) hidePopover();
    }, 150);
  }, true);
  window.addEventListener('resize', rerender, { passive: true });
  window.addEventListener('scroll', rerender, true);
})();
`;

const listeners = new WeakMap<WebContents, (event: unknown, method: string, params?: unknown) => void>();
let started = false;

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amount));
  const mix = (c: number): string =>
    Math.round(c + (target - c) * p)
      .toString(16)
      .padStart(2, '0');
  const [r, g, b] = toRgb(hex);
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function typoUnderlineColor(): string {
  const { theme, themeColor } = PreferenceStore.getAll();
  if (HEX_COLOR_RE.test(themeColor)) {
    const dark = luminance(themeColor) < 0.5;
    return shade(themeColor, dark ? 0.38 : -0.3);
  }
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? DARK_PRIMARY : LIGHT_PRIMARY;
}

function typoCss(): string {
  return `:root { --tepegoz-typo-underline: ${typoUnderlineColor()}; }\n${TYPO_CSS}`;
}

function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

async function ensureBinding(wc: WebContents): Promise<void> {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Runtime.enable');
  await wc.debugger.sendCommand('Runtime.addBinding', { name: BINDING }).catch(() => undefined);
  if (listeners.has(wc)) return;
  const listener = (_event: unknown, method: string, params?: unknown): void => {
    if (method !== 'Runtime.bindingCalled') return;
    const parsed = DebuggerPayloadSchema.safeParse(params);
    if (!parsed.success || parsed.data.name !== BINDING) return;
    let payload: z.infer<typeof BindingPayloadSchema>;
    try {
      payload = BindingPayloadSchema.parse(JSON.parse(parsed.data.payload));
    } catch {
      return;
    }
    const origin = originOf(wc.getURL());
    if (origin === undefined || !typoHost.isActiveForPage(origin)) return;
    void typoHost
      .check({ text: payload.text, language: payload.language, origin, aiMode: 'auto' })
      .then((result) => {
        if (wc.isDestroyed()) return;
        const message = JSON.stringify({ requestId: payload.requestId, result });
        return wc.executeJavaScript(`window.__tepegozTypoReceive?.(${message});`, true);
      })
      .catch((err) => {
        Logger.warn('Typo page check failed', { err: String(err) });
      });
  };
  listeners.set(wc, listener);
  wc.debugger.on('message', listener);
  wc.once('destroyed', () => {
    const installed = listeners.get(wc);
    if (installed !== undefined) {
      wc.debugger.removeListener('message', installed);
      listeners.delete(wc);
    }
  });
}

async function inject(url: string, wc: WebContents): Promise<void> {
  if (wc.isDestroyed() || !typoHost.isActiveForPage(url)) return;
  try {
    await ensureBinding(wc);
    await wc.insertCSS(typoCss()).catch(() => undefined);
    await wc.executeJavaScript(TYPO_SCRIPT, true);
  } catch (err) {
    Logger.warn('Typo page injection failed', { err: String(err) });
  }
}

const TypoPageInjector = {
  start(): void {
    if (started) return;
    started = true;
    TabManager.onNavigation((url, wc) => {
      void inject(url, wc);
    });
  },
};

export default TypoPageInjector;
