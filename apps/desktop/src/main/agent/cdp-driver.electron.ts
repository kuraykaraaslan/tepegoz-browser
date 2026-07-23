import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import { HumanInputAdapter } from '@tepegoz/human-input';
import type { NetworkObservation } from '@tepegoz/browser-tools';
import {
  LOAD_TIMEOUT_MS,
  type DriverCore,
  type NodeArg,
  type RefTarget,
  type SnapshotDeps,
  type SnapshotResult,
} from './cdp-driver-schemas.electron.js';
import { pathToObjectId, readValue } from './cdp-driver-dom.electron.js';
import { attachNetworkRecorder, networkSince } from './cdp-driver-network.electron.js';
import { waitForPageSettled } from './cdp-driver-session.electron.js';
import { snapshotElements as snapshotElementsImpl } from './cdp-driver-snapshot.electron.js';
import {
  clickElement as clickElementImpl,
  fillElement as fillElementImpl,
  pressKey as pressKeyImpl,
  scrollPage as scrollPageImpl,
  selectOption as selectOptionImpl,
  setFileInputFiles as setFileInputFilesImpl,
} from './cdp-driver-input.electron.js';

/**
 * L4 out-of-process CDP driver. Drives the active tab's page through Electron's `webContents.debugger`
 * (the same out-of-process Chrome DevTools Protocol channel DevTools uses) rather than injecting
 * scripts into the untrusted page context. It reads the accessibility tree (`Accessibility.getFullAXTree`)
 * to build the actionable-element set and dispatches real user input (`Input.dispatchMouseEvent` /
 * `dispatchKeyEvent`) at the element's on-screen box — so clicks/typing behave like a human and can't be
 * observed or tampered with by page JS.
 *
 * One debugger attachment is kept on the currently-active WebContents; switching tabs re-attaches. The
 * `ref → backendNodeId` map from the latest snapshot is what the action calls resolve against, so a
 * `ref` is only valid until the next {@link snapshotElements}. Page-controlled labels stay untrusted —
 * sanitization + taint happen downstream in `@tepegoz/browser-tools` perception.
 *
 * This file is the facade: the per-concern logic lives in the sibling `cdp-driver-*.electron.ts` modules
 * (schemas, session/settling, dom query, snapshot/perception, input/gestures). The class owns the shared
 * attachment state and lends it to those pure helpers via {@link DriverCore} / {@link SnapshotDeps}.
 */
export default class CdpDriver {
  /** The WebContents the debugger is currently attached to (null when detached). */
  private static attached: WebContents | null = null;
  /** Per-tab ref (1-based) → node target maps, from each tab's latest snapshot. */
  private static readonly refMaps = new WeakMap<WebContents, Map<number, RefTarget>>();
  /** Per-tab previous render-DOM snapshot (url + element fingerprints) for `*[n]` new-element marking. */
  private static readonly prevSnapshots = new WeakMap<WebContents, { url: string; hashes: Set<string> }>();

  /** The state-owning collaborators the extracted input helpers borrow. */
  private static core(): DriverCore {
    return {
      ensure: (wc) => CdpDriver.ensureAttached(wc),
      resolveRef: (wc, ref) => CdpDriver.resolveRef(wc, ref),
      settle: (wc) => CdpDriver.settle(wc),
    };
  }

  /** The per-tab snapshot state the extracted perception helpers borrow. */
  private static snapshotDeps(): SnapshotDeps {
    return {
      ensure: (wc) => CdpDriver.ensureAttached(wc),
      refMaps: CdpDriver.refMaps,
      prevSnapshots: CdpDriver.prevSnapshots,
    };
  }

  /** Attach + enable the domains we need on `wc`, re-attaching if the active tab changed. */
  private static async ensureAttached(wc: WebContents): Promise<void> {
    if (CdpDriver.attached === wc && wc.debugger.isAttached()) return;
    CdpDriver.detach();
    try {
      wc.debugger.attach('1.3');
    } catch (err) {
      throw new AppError(
        `Cannot drive the page (is DevTools open on it?): ${String(err)}`,
        409,
      );
    }
    CdpDriver.attached = wc;
    // Subscribe BEFORE Network.enable so the first navigation's responses are not missed (AI-8B).
    // Idempotent per WebContents, so re-attaching on a tab switch cannot double-subscribe.
    attachNetworkRecorder(wc);
    // A tab that navigates/closes must not leave us pointing at a dead session.
    wc.debugger.once('detach', () => {
      if (CdpDriver.attached === wc) CdpDriver.attached = null;
    });
    wc.once('destroyed', () => {
      if (CdpDriver.attached === wc) CdpDriver.attached = null;
      CdpDriver.refMaps.delete(wc);
      CdpDriver.prevSnapshots.delete(wc);
    });
    await wc.debugger.sendCommand('DOM.enable');
    await wc.debugger.sendCommand('Accessibility.enable');
    await wc.debugger.sendCommand('Page.enable');
    await wc.debugger.sendCommand('Runtime.enable');
    await wc.debugger.sendCommand('Network.enable');
    // Make the page behave as focused even when its OS window is NOT — the agent must be able to fill and
    // interact with a tab while the user has another window/app in front (and the eval window is shown
    // inactive by design). Without this, a synthetic click on an input in an unfocused window does not
    // make it `document.activeElement`, so the subsequent typing silently goes nowhere and every fill
    // no-ops (measured on the AI-1 harness: `[fill] focus:false`, field empty). This is the standard,
    // non-intrusive mechanism (what Puppeteer/Playwright enable by default); it does NOT steal OS focus
    // and preserves the real-click-to-focus path. Best-effort — an older/edge target that lacks it must
    // not break attach.
    await wc.debugger
      .sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
      .catch((err) => Logger.warn('focus emulation unavailable', { err: String(err) }));
  }

  /** Detach the debugger from the current WebContents (best-effort; swallows teardown races). */
  private static detach(): void {
    const wc = CdpDriver.attached;
    if (wc !== null && !wc.isDestroyed() && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach();
      } catch (err) {
        Logger.warn('CDP detach failed', { err: String(err) });
      }
    }
    CdpDriver.attached = null;
  }

  /**
   * Read the active page's actionable elements. Uses render-DOM perception (interactivity + occlusion
   * + viewport + `href`/attributes) by default, falling back to the accessibility-tree snapshot when
   * that path is disabled or errors. Both populate the per-tab `ref → node` map for action dispatch.
   */
  static async snapshotElements(
    wc: WebContents,
    opts: { viewportExpansionPx?: number } = {},
  ): Promise<SnapshotResult> {
    return snapshotElementsImpl(wc, CdpDriver.snapshotDeps(), opts);
  }

  /**
   * Resolve a snapshot `ref` to a live node handle, guarding against stale refs / tab switches. The
   * a11y path returns the stored `backendNodeId`; the render-DOM path re-resolves the stored XPath to
   * a fresh object handle against the current DOM (so a `ref` stays valid within its snapshot).
   */
  private static async resolveRef(wc: WebContents, ref: number): Promise<NodeArg> {
    const refMap = CdpDriver.refMaps.get(wc);
    if (refMap === undefined) {
      throw new AppError('Element refs are stale — read the page elements again first', 409);
    }
    const target = refMap.get(ref);
    if (target === undefined) throw new AppError(`No element with ref ${String(ref)}`, 404);
    if ('backendNodeId' in target) return { backendNodeId: target.backendNodeId };
    return { objectId: await pathToObjectId(wc, target.path) };
  }

  static async setFileInputFiles(
    wc: WebContents,
    ref: number,
    paths: string[],
  ): Promise<{ accept: string; multiple: boolean }> {
    return setFileInputFilesImpl(wc, ref, paths, CdpDriver.core());
  }

  static async clickElement(
    wc: WebContents,
    ref: number,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    return clickElementImpl(wc, ref, adapter, CdpDriver.core());
  }

  static async fillElement(
    wc: WebContents,
    ref: number,
    text: string,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    return fillElementImpl(wc, ref, text, adapter, CdpDriver.core());
  }

  /**
   * The current value of the form control at `ref` (from this tab's latest snapshot), or `null` when the
   * element has no value semantics / the ref went stale. Reads the SAME snapshot's ref — no re-snapshot,
   * so existing refs stay valid. Lets `browser_update_page` verify a fill instead of assuming it.
   */
  static async readElementValue(wc: WebContents, ref: number): Promise<string | null> {
    await CdpDriver.ensureAttached(wc);
    const node = await CdpDriver.resolveRef(wc, ref);
    return readValue(wc, node);
  }

  static async selectOption(
    wc: WebContents,
    ref: number,
    value: string,
  ): Promise<{ selected: string | null; options: string[] }> {
    return selectOptionImpl(wc, ref, value, CdpDriver.core());
  }

  static async pressKey(
    wc: WebContents,
    key: string,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    return pressKeyImpl(wc, key, adapter, CdpDriver.core());
  }

  static async scrollPage(
    wc: WebContents,
    direction: 'up' | 'down',
    amount?: number,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    return scrollPageImpl(wc, direction, amount, adapter, CdpDriver.core());
  }

  /**
   * HTTP responses observed on `wc` at or after `sinceMs` (host clock) — AI-8B post-action verification.
   * Empty means "nothing observed" (e.g. a tab never attached), NOT "everything succeeded".
   */
  static networkSince(wc: WebContents, sinceMs: number): NetworkObservation[] {
    return networkSince(wc, sinceMs);
  }

  /** Wait for a load triggered by an interaction to settle, then network and DOM quiescence. */
  static async waitForPageSettled(wc: WebContents, timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
    await waitForPageSettled(wc, (target) => CdpDriver.ensureAttached(target), timeoutMs);
  }

  /** Wait for a load triggered by an interaction to settle. */
  private static async settle(wc: WebContents): Promise<void> {
    await CdpDriver.waitForPageSettled(wc);
  }
}
