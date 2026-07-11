import type { WebContents } from 'electron';
import { AppError } from '@tepegoz/libs';
import { HumanInputAdapter } from '@tepegoz/human-input';
import {
  DEFAULT_SCROLL_PX,
  KEY_MAP,
  SELECT_OPTION_FN,
  SelectResultSchema,
  type DriverCore,
  type KeySpec,
} from './cdp-driver-schemas.electron.js';
import { centerOf, fileInputInfo, isFocused, objectIdFor } from './cdp-driver-dom.electron.js';

/**
 * Input/gesture concern for {@link CdpDriver}: dispatches real user input (clicks, typing, key presses,
 * wheel scroll) at an element's on-screen box. Preserves the human-input realism path EXACTLY —
 * click-to-focus (never DOM.focus on the active tab), verify+retry, randomized inter-action idle. State
 * lives in the driver class; it is lent here via {@link DriverCore} (ensure / resolveRef / settle).
 */

/** Dispatch a keyDown+keyUp for one key, with optional modifier bitmask (CDP: 2 = Ctrl). */
async function sendKey(wc: WebContents, spec: KeySpec, modifiers = 0): Promise<void> {
  const common = {
    modifiers,
    key: spec.key,
    code: spec.code,
    windowsVirtualKeyCode: spec.keyCode,
    nativeVirtualKeyCode: spec.keyCode,
  };
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: spec.text === undefined ? 'rawKeyDown' : 'keyDown',
    ...common,
    ...(spec.text === undefined ? {} : { text: spec.text }),
  });
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
}

export async function setFileInputFiles(
  wc: WebContents,
  ref: number,
  paths: string[],
  core: DriverCore,
): Promise<{ accept: string; multiple: boolean }> {
  await core.ensure(wc);
  const node = await core.resolveRef(wc, ref);
  const info = await fileInputInfo(wc, node);
  if (info === null) throw new AppError('Target element is not a file input', 409);
  if (!info.multiple && paths.length > 1) {
    throw new AppError('Target file input does not accept multiple files', 409);
  }
  await wc.debugger.sendCommand('DOM.setFileInputFiles', { ...node, files: paths });
  await core.settle(wc);
  return info;
}

export async function clickElement(
  wc: WebContents,
  ref: number,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<void> {
  await core.ensure(wc);
  const node = await core.resolveRef(wc, ref);
  const { x, y } = await centerOf(wc, node);
  if (adapter === undefined) {
    const base = { x, y, button: 'left' as const, clickCount: 1 };
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  } else {
    await adapter.idle(); // human think/react pause between behaviors
    await adapter.click(x, y);
  }
  await core.settle(wc);
}

export async function fillElement(
  wc: WebContents,
  ref: number,
  text: string,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<void> {
  await core.ensure(wc);
  const node = await core.resolveRef(wc, ref);
  const { x, y } = await centerOf(wc, node);
  if (adapter === undefined) {
    // Background-tab teleport fallback (no visible cursor): programmatic focus is acceptable here.
    await wc.debugger.sendCommand('DOM.focus', { ...node });
    // Select any existing value (Ctrl+A) so the insert replaces it, then type the new text.
    await sendKey(wc, { key: 'a', code: 'KeyA', keyCode: 65 }, 2 /* Ctrl */);
    await wc.debugger.sendCommand('Input.insertText', { text });
  } else {
    // Active tab: focus the field with a REAL trusted click (never DOM.focus). If the click lands
    // on something covering the center, verify focus and retry — recomputing the box in case the
    // layout shifted (e.g. an overlay dismissed on the first click).
    await adapter.idle(); // human think/react pause between behaviors
    let target = { x, y };
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await adapter.idle(200, 70);
        target = await centerOf(wc, node);
      }
      await adapter.click(target.x, target.y);
      if (await isFocused(wc, node)) break;
    }
    await adapter.idle(200, 70); // beat: click -> select-all
    // Ctrl+A with a text-less KeySpec => rawKeyDown, so it fires the accelerator without typing 'a'.
    await adapter.pressKey({ key: 'a', code: 'KeyA', keyCode: 65 }, 2 /* Ctrl */);
    await adapter.idle(200, 70); // beat: select-all -> type
    await adapter.insertText(text);
  }
  await core.settle(wc);
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

export async function pressKey(
  wc: WebContents,
  key: string,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<void> {
  await core.ensure(wc);
  const spec = KEY_MAP[key];
  if (spec === undefined) throw new AppError(`Unsupported key: ${key}`, 400);
  if (adapter === undefined) {
    await sendKey(wc, spec);
  } else {
    await adapter.idle(); // human think/react pause between behaviors
    await adapter.pressKey(spec);
  }
  await core.settle(wc);
}

export async function scrollPage(
  wc: WebContents,
  direction: 'up' | 'down',
  amount: number | undefined,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<void> {
  await core.ensure(wc);
  if (adapter === undefined) {
    const deltaY = (direction === 'down' ? 1 : -1) * (amount ?? DEFAULT_SCROLL_PX);
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 10,
      y: 10,
      deltaX: 0,
      deltaY,
    });
  } else {
    await adapter.idle(); // human think/react pause between behaviors
    await adapter.scroll(direction, amount);
  }
  await core.settle(wc);
}
