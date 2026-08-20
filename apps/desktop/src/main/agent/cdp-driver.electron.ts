import type { WebContents } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import { HumanInputAdapter } from '@tepegoz/human-input';
import type { InterceptedDialog, NetworkObservation } from '@tepegoz/browser-tools';
import {
  LOAD_TIMEOUT_MS,
  type DriverCore,
  type NodeArg,
  type RefTarget,
  type SnapshotDeps,
  type SnapshotResult,
} from './cdp-driver-schemas.electron.js';
import {
  isOriginSwap,
  originOf,
  originSwapMessage,
  type RefRegistry,
} from '@tepegoz/tool-executor';
import { locatorsToObjectId, pathToObjectId, readValue } from './cdp-driver-dom.electron.js';
import { attachDialogInterceptor, interceptionsSince } from './cdp-driver-dialogs.electron.js';
import { attachNetworkRecorder, networkSince } from './cdp-driver-network.electron.js';
import { waitForPageSettled } from './cdp-driver-session.electron.js';
import { snapshotElements as snapshotElementsImpl } from './cdp-driver-snapshot.electron.js';
import {
  clickElement as clickElementImpl,
  fillElement as fillElementImpl,
  hoverElement as hoverElementImpl,
  pressKey as pressKeyImpl,
  sendKeys as sendKeysImpl,
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
 * A debugger attachment is kept **per driven tab** (they are independent Electron sessions), so two
 * runs can drive two tabs without tearing down each other's. The `ref → backendNodeId` map from each
 * tab's latest snapshot is what that tab's action calls resolve against, so a `ref` is only valid until
 * the next {@link snapshotElements} on the SAME tab. Page-controlled labels stay untrusted —
 * sanitization + taint happen downstream in `@tepegoz/browser-tools` perception.
 *
 * This file is the facade: the per-concern logic lives in the sibling `cdp-driver-*.electron.ts` modules
 * (schemas, session/settling, dom query, snapshot/perception, input/gestures). The class owns the shared
 * attachment state and lends it to those pure helpers via {@link DriverCore} / {@link SnapshotDeps}.
 */
export default class CdpDriver {
  /**
   * The tabs the debugger is currently attached to.
   *
   * A **set**, not a single WebContents: attaching used to detach whatever tab was attached before, so
   * two runs driving two tabs would tear down each other's session on every action. Electron's
   * `webContents.debugger` is per-WebContents and each attachment is independent — the "one at a time"
   * shape was bookkeeping, never a protocol constraint. A `WeakSet` because membership must die with the
   * tab; nothing iterates it, and nothing needs to.
   *
   * Trade-off, stated: an attached tab keeps `Network`/`Page`/`Runtime` domains enabled, so N driven
   * tabs cost N enabled sessions rather than one. Both listeners this installs are already
   * idempotent-per-tab and bounded, and a tab is detached the moment it is destroyed — but tabs the
   * agent has driven do stay attached until then, where previously only the last one did. No cap is
   * imposed on purpose: evicting an attachment mid-run would break a live run's refs to save memory
   * nobody has measured a problem with.
   */
  private static readonly attached = new WeakSet<WebContents>();
  /** Per-tab ref (1-based) → node target maps, from each tab's latest snapshot. */
  private static readonly refMaps = new WeakMap<WebContents, Map<number, RefTarget>>();
  /** Per-tab previous render-DOM snapshot (url + element fingerprints) for `*[n]` new-element marking. */
  private static readonly prevSnapshots = new WeakMap<
    WebContents,
    { url: string; hashes: Set<string> }
  >();
  /** S2 PR1: per-tab identity → ref carry-over for stable refs (unused on the positional path). */
  private static readonly refRegistries = new WeakMap<WebContents, RefRegistry>();
  /** S4 PR2: the page URL each tab's ref map was built against. */
  private static readonly refOrigins = new WeakMap<WebContents, string>();

  /** The state-owning collaborators the extracted input helpers borrow. */
  private static core(): DriverCore {
    return {
      ensure: (wc) => CdpDriver.ensureAttached(wc),
      resolveRef: (wc, ref) => CdpDriver.resolveRef(wc, ref),
      settle: (wc) => CdpDriver.settle(wc),
      assertSameOrigin: (wc) => {
        CdpDriver.assertSameOrigin(wc);
      },
    };
  }

  /** The per-tab snapshot state the extracted perception helpers borrow. */
  private static snapshotDeps(): SnapshotDeps {
    return {
      ensure: (wc) => CdpDriver.ensureAttached(wc),
      refMaps: CdpDriver.refMaps,
      prevSnapshots: CdpDriver.prevSnapshots,
      refRegistries: CdpDriver.refRegistries,
      refOrigins: CdpDriver.refOrigins,
    };
  }

  /** Attach + enable the domains we need on `wc`. Idempotent per tab; never touches another tab. */
  private static async ensureAttached(wc: WebContents): Promise<void> {
    if (CdpDriver.attached.has(wc) && wc.debugger.isAttached()) return;
    try {
      wc.debugger.attach('1.3');
    } catch (err) {
      throw new AppError(`Cannot drive the page (is DevTools open on it?): ${String(err)}`, 409);
    }
    CdpDriver.attached.add(wc);
    // Subscribe BEFORE Network.enable so the first navigation's responses are not missed (AI-8B).
    // Idempotent per WebContents, so re-attaching on a tab switch cannot double-subscribe.
    attachNetworkRecorder(wc);
    // S3 PR4: same idempotent-per-tab shape — auto-decline any JS dialog and suppress `beforeunload`
    // (see cdp-driver-dialogs.electron.ts for why, and the spike that cleared the DevTools-conflict risk).
    attachDialogInterceptor(wc);
    // A tab that navigates/closes must not leave us thinking its session is live.
    wc.debugger.once('detach', () => {
      CdpDriver.attached.delete(wc);
    });
    wc.once('destroyed', () => {
      CdpDriver.attached.delete(wc);
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

  /** Detach the debugger from ONE tab (best-effort; swallows teardown races). */
  static detach(wc: WebContents): void {
    if (!wc.isDestroyed() && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach();
      } catch (err) {
        Logger.warn('CDP detach failed', { err: String(err) });
      }
    }
    CdpDriver.attached.delete(wc);
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
  /**
   * S4 PR2 — the navigation-swap gate. Throws when the page changed origin since the ref map was built.
   *
   * Silent on an unknown origin: the check must be able to PROVE a swap before it refuses, and treating
   * "I could not read the URL" as a swap would make ordinary pages unclickable. `AppError(409)` so the
   * reactor observes it as a recoverable step failure and re-reads, rather than the run dying.
   */
  private static assertSameOrigin(wc: WebContents): void {
    const located = CdpDriver.refOrigins.get(wc);
    if (located === undefined) return;
    const current = wc.getURL();
    if (!isOriginSwap(located, current)) return;
    Logger.warn('[input] refusing a state-changing action after a navigation swap', {
      located: originOf(located),
      current: originOf(current),
    });
    throw new AppError(originSwapMessage(located, current), 409);
  }

  private static async resolveRef(wc: WebContents, ref: number): Promise<NodeArg> {
    const refMap = CdpDriver.refMaps.get(wc);
    if (refMap === undefined) {
      throw new AppError('Element refs are stale — read the page elements again first', 409);
    }
    const target = refMap.get(ref);
    if (target === undefined) throw new AppError(`No element with ref ${String(ref)}`, 404);
    if ('backendNodeId' in target) return { backendNodeId: target.backendNodeId };
    // S3 PR5 — locator cascade: the recorded child-index path first (exact and cheap), then the element's
    // identity. A stale path used to cost a full re-snapshot, which renumbers every positional ref and
    // takes the model's whole plan with it; a re-snapshot is now the LAST resort, not the first.
    const byPath = await pathToObjectId(wc, target.path).catch(() => null);
    if (byPath !== null) return { objectId: byPath };
    const locators = target.locators;
    if (locators !== undefined && locators.tag.length > 0) {
      const byIdentity = await locatorsToObjectId(wc, locators);
      if (byIdentity !== null) {
        Logger.info('[input] ref re-found by identity after a stale path', {
          ref,
          tag: locators.tag,
        });
        return { objectId: byIdentity };
      }
    }
    throw new AppError(
      'Element is no longer on the page — read the page elements again first',
      409,
    );
  }

  static async setFileInputFiles(
    wc: WebContents,
    ref: number,
    paths: string[],
  ): Promise<{ accept: string; multiple: boolean }> {
    return setFileInputFilesImpl(wc, ref, paths, CdpDriver.core());
  }

  /** Move the pointer over an element (S3 PR6) — the only gesture a `:hover` menu responds to. */
  static async hoverElement(
    wc: WebContents,
    ref: number,
    adapter?: HumanInputAdapter,
  ): Promise<void> {
    return hoverElementImpl(wc, ref, adapter, CdpDriver.core());
  }

  static async clickElement(
    wc: WebContents,
    ref: number,
    adapter?: HumanInputAdapter,
  ): Promise<{ occludedBy: string | null }> {
    return clickElementImpl(wc, ref, adapter, CdpDriver.core());
  }

  static async fillElement(
    wc: WebContents,
    ref: number,
    text: string,
    adapter?: HumanInputAdapter,
  ): Promise<{ widget: 'readonly' | 'disabled' | 'combobox' | null }> {
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
  ): Promise<{ sent: number; unsupported: string[] }> {
    return pressKeyImpl(wc, key, adapter, CdpDriver.core());
  }

  /** Chords + sequences (S3 PR2). An unsupported key is reported, never thrown. */
  static async sendKeys(
    wc: WebContents,
    keys: string,
    adapter?: HumanInputAdapter,
  ): Promise<{ sent: number; unsupported: string[] }> {
    return sendKeysImpl(wc, keys, adapter, CdpDriver.core());
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

  /**
   * Dialogs/`beforeunload` prompts intercepted on `wc` at or after `sinceMs` (S3 PR4) — an auto-declined
   * `window.confirm`/`alert`/`prompt`, or a suppressed unsaved-changes prompt. Empty means "nothing
   * observed", NOT "nothing happened".
   */
  static interceptionsSince(wc: WebContents, sinceMs: number): InterceptedDialog[] {
    return interceptionsSince(wc, sinceMs);
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
