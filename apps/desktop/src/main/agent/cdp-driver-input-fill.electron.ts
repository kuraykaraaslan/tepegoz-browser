import type { WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import type { HumanInputAdapter } from '@tepegoz/human-input';
import {
  SELECT_OPTION_FN,
  SelectResultSchema,
  type DriverCore,
  type NodeArg,
} from './cdp-driver-schemas.electron.js';
import {
  centerOf,
  findWidgetOptionInPage,
  isFocused,
  objectIdFor,
  widgetKindOf,
} from './cdp-driver-dom.electron.js';

/**
 * Field-filling concern of the input driver (see `cdp-driver-input.electron`): widget-driven popups,
 * real-click focus with verify+retry, select-all-then-type replacement, and native `<select>` choice.
 */

/** Poll {@link isFocused} until the node is focused or the budget elapses. A synthetic click focuses the
 *  element ASYNCHRONOUSLY (notably in a backgrounded/inactive window), so an immediate check races the
 *  focus and reads false even when the click worked — measured on the AI-1 harness. ~500 ms is generous;
 *  a real focus lands in a frame or two. */
async function waitForFocus(wc: WebContents, node: NodeArg, timeoutMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await isFocused(wc, node)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Poll {@link findWidgetOptionInPage} until a matching option renders or the budget elapses (S3 PR7): a
 *  popup can take a tick to open (a CSS transition, a JS timeout), so an immediate read races it the same
 *  way an immediate focus check races a synthetic click — see {@link waitForFocus}. */
async function waitForWidgetOption(
  wc: WebContents,
  text: string,
  timeoutMs = 1000,
): Promise<{ x: number; y: number; label: string } | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await findWidgetOptionInPage(wc, text);
    if (found !== null) return found;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Dispatch a real click at an on-screen point — the raw-CDP / human-adapter branch every click-shaped
 *  gesture in this file shares. */
async function dispatchClick(
  wc: WebContents,
  adapter: HumanInputAdapter | undefined,
  x: number,
  y: number,
): Promise<void> {
  if (adapter === undefined) {
    const base = { x, y, button: 'left' as const, clickCount: 1 };
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  } else {
    await adapter.idle();
    await adapter.click(x, y);
  }
}

/**
 * Drive a widget-driven field's own popup instead of typing into it (S3 PR7 fill strategy): open it with
 * a real click, wait for the option/day matching `text` to render, and click THAT — never set a value
 * the page did not arrive at through its own widget, which is exactly the false success `widgetKindOf`
 * exists to catch. Only attempted for `readonly`/`combobox` — a `disabled` field cannot be opened at all,
 * so the caller never calls this for that kind.
 */
async function driveWidgetOption(
  wc: WebContents,
  node: NodeArg,
  text: string,
  adapter: HumanInputAdapter | undefined,
): Promise<boolean> {
  const { x, y } = await centerOf(wc, node);
  await dispatchClick(wc, adapter, x, y);
  const found = await waitForWidgetOption(wc, text);
  if (found === null) return false;
  await dispatchClick(wc, adapter, found.x, found.y);
  return true;
}

/**
 * Select ALL existing content of the focused field so the following {@link HumanInputAdapter.insertText}
 * REPLACES it rather than appending. Deterministic (`el.select()` / `setSelectionRange` / a Range over a
 * contenteditable) instead of a Ctrl+A keyboard accelerator — the accelerator does not reliably
 * select-all in a backgrounded/unfocused window (measured on the AI-1 harness: a pre-filled field kept
 * its old value, so the agent believed the fill failed and gave up). The trusted click already supplied
 * the human gesture; this only guarantees the replace.
 */
async function selectAllContent(wc: WebContents, node: NodeArg): Promise<void> {
  const objectId = await objectIdFor(wc, node).catch(() => null);
  if (objectId === null) return;
  await wc.debugger
    .sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration:
        'function(){' +
        'var el=this;' +
        "if(typeof el.select==='function'){el.select();return;}" +
        "if(typeof el.setSelectionRange==='function'){el.setSelectionRange(0,(el.value||'').length);return;}" +
        'if(el.isContentEditable){var r=document.createRange();r.selectNodeContents(el);' +
        'var s=window.getSelection();s.removeAllRanges();s.addRange(r);}' +
        '}',
      returnByValue: true,
    })
    .catch(() => undefined);
}

export async function fillElement(
  wc: WebContents,
  ref: number,
  text: string,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<{ widget: 'readonly' | 'disabled' | 'combobox' | null }> {
  await core.ensure(wc);
  core.assertSameOrigin(wc);
  const node = await core.resolveRef(wc, ref);
  // S3 PR7: a readonly/disabled field, or an ARIA combobox with a popup, takes its value from its own
  // widget. Typing does nothing, and a fill that "succeeds" into a field the page ignores is the most
  // expensive false success there is — the agent goes on to submit a form it never filled. For
  // readonly/combobox, DRIVE the widget instead of refusing outright: open it and click the option/day
  // matching `text`. A disabled field cannot be opened at all, so it goes straight to refusal.
  const widget = await widgetKindOf(wc, node);
  if (widget !== null) {
    if (widget !== 'disabled' && (await driveWidgetOption(wc, node, text, adapter))) {
      await core.settle(wc);
      return { widget: null };
    }
    Logger.info('[input] fill refused: widget-driven field', { ref, widget });
    return { widget };
  }
  const { x, y } = await centerOf(wc, node);
  if (adapter === undefined) {
    // Background-tab teleport fallback (no visible cursor): programmatic focus is acceptable here.
    await wc.debugger.sendCommand('DOM.focus', { ...node });
    // Select any existing value so the insert REPLACES it, then type the new text.
    await selectAllContent(wc, node);
    await wc.debugger.sendCommand('Input.insertText', { text });
  } else {
    // Active tab: focus the field with a REAL trusted click (never DOM.focus). If the click lands
    // on something covering the center, verify focus and retry — recomputing the box in case the
    // layout shifted (e.g. an overlay dismissed on the first click).
    await adapter.idle(); // human think/react pause between behaviors
    let target = { x, y };
    let focused = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await adapter.idle(200, 70);
        target = await centerOf(wc, node);
      }
      await adapter.click(target.x, target.y);
      // Focus lands ASYNCHRONOUSLY after a synthetic click, especially in a backgrounded/inactive window
      // (measured on the AI-1 harness: an immediate check reads false, yet a click seconds later reads
      // true and the fill then works perfectly). Poll briefly so we don't type before focus settles.
      focused = await waitForFocus(wc, node);
      if (focused) break;
    }
    // Last resort: the trusted click(s) never took focus (e.g. an inactive window that even focus
    // emulation didn't cover). A fill that silently types into nothing is worse than a programmatic
    // focus, and the real click was already dispatched (so the trusted-gesture signal is present) —
    // fall back to DOM.focus so the value reliably lands rather than no-oping.
    if (!focused) {
      // The window was almost certainly unfocused (eval, or the user switched apps): synthetic clicks
      // don't focus an input there, so type would no-op. Log at warn so this stays visible if it ever
      // fires in a context we thought was focused.
      Logger.warn('fill: click did not focus target; using DOM.focus fallback');
      await wc.debugger.sendCommand('DOM.focus', { ...node }).catch(() => undefined);
    }
    await adapter.idle(200, 70); // beat: click -> select-all
    // Deterministically select existing content so the type replaces it (Ctrl+A is unreliable in an
    // unfocused window); the trusted click above is the human gesture.
    await selectAllContent(wc, node);
    await adapter.idle(200, 70); // beat: select-all -> type
    await adapter.insertText(text);
  }
  await core.settle(wc);
  return { widget: null };
}

/** Choose an option in a native `<select>` at `ref` (see {@link SELECT_OPTION_FN}). Deterministic —
 *  sets value + fires change in the page; no OS-popup interaction. Returns the matched label + options. */
export async function selectOption(
  wc: WebContents,
  ref: number,
  value: string,
  core: DriverCore,
): Promise<{ selected: string | null; options: string[] }> {
  await core.ensure(wc);
  core.assertSameOrigin(wc);
  const node = await core.resolveRef(wc, ref);
  const objectId = await objectIdFor(wc, node);
  const raw: unknown = await wc.debugger.sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: SELECT_OPTION_FN,
    arguments: [{ value }],
    returnByValue: true,
  });
  await core.settle(wc);
  const parsed = SelectResultSchema.safeParse(raw);
  if (!parsed.success) return { selected: null, options: [] };
  return parsed.data.result.value;
}
