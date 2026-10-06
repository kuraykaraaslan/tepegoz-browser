import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import { HumanInputAdapter } from '@tepegoz/human-input';
import { DEFAULT_SCROLL_PX, type DriverCore } from './cdp-driver-schemas.electron.js';
import { centerOf, fileInputInfo, probeClickPoint } from './cdp-driver-dom.electron.js';

/**
 * Input/gesture concern for {@link CdpDriver}: dispatches real user input (clicks, typing, key presses,
 * wheel scroll) at an element's on-screen box. Preserves the human-input realism path EXACTLY —
 * click-to-focus (never DOM.focus on the active tab), verify+retry, randomized inter-action idle. State
 * lives in the driver class; it is lent here via {@link DriverCore} (ensure / resolveRef / settle).
 */

export async function setFileInputFiles(
  wc: WebContents,
  ref: number,
  paths: string[],
  core: DriverCore,
): Promise<{ accept: string; multiple: boolean }> {
  await core.ensure(wc);
  core.assertSameOrigin(wc);
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
): Promise<{ occludedBy: string | null }> {
  await core.ensure(wc);
  core.assertSameOrigin(wc);
  const node = await core.resolveRef(wc, ref);
  const center = await centerOf(wc, node);
  // S3 PR5: occlusion was only ever checked during the SCAN, so a banner or sticky overlay appearing
  // between snapshot and click intercepted the gesture and the click read as "no visible change" — the
  // direct cause of `cookie_consent` failing with zero escapes. Probe again, here, at dispatch time.
  const probe = await probeClickPoint(wc, node);
  if (probe.blocker !== null) {
    Logger.info('[input] click refused: target is covered', { ref, blocker: probe.blocker });
    return { occludedBy: probe.blocker };
  }
  const { x, y } = probe.x === 0 && probe.y === 0 ? center : probe;
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
  return { occludedBy: null };
}

/**
 * Move the pointer over an element and leave it there (S3 PR6).
 *
 * A `:hover` menu opens for no other gesture: it has no click handler and no focus rule, so its links
 * are not in the actionable set at all until the pointer is genuinely over the trigger. This reuses the
 * same Catmull-Rom path a click uses — the movement a real pointer makes is what the page's own
 * `mouseover` handlers respond to.
 *
 * No settle afterwards: a hover-revealed menu is a structural change the caller observes by re-reading,
 * and waiting for the page to go quiet after a pointer move would charge every hover a load budget.
 */
export async function hoverElement(
  wc: WebContents,
  ref: number,
  adapter: HumanInputAdapter | undefined,
  core: DriverCore,
): Promise<void> {
  await core.ensure(wc);
  const node = await core.resolveRef(wc, ref);
  const { x, y } = await centerOf(wc, node);
  if (adapter === undefined) {
    await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  } else {
    await adapter.idle(); // human think/react pause between behaviors
    await adapter.moveTo(x, y);
  }
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

// The keyboard, drag and fill concerns live in sibling modules; re-exported so every importer of this
// file (the driver, its tests) keeps its existing import path and surface.
export { dragElement } from './cdp-driver-input-drag.electron.js';
export { fillElement, selectOption } from './cdp-driver-input-fill.electron.js';
export { pressKey, sendKeys } from './cdp-driver-input-keys.electron.js';
