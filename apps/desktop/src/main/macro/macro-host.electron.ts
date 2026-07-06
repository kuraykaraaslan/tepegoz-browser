import { AppError } from '@tepegoz/libs';
import type { WebContents } from 'electron';
import type { MacroHost } from '@tepegoz/macro-engine';
import type { SelectorChain } from '@tepegoz/shared-types';
import { HumanInputAdapter } from '@tepegoz/human-input';
import TabManager from '../tabs';
import MacroCdp from '../agent/macro-cdp.electron';
import { browserHost } from '../agent/browser-host.electron';
import { showPageCursor, hidePageCursor, isUserControlActive } from '../agent/page-cursor.electron';

/**
 * Desktop {@link MacroHost} for `@tepegoz/macro-engine`: implements the deterministic runtime's
 * browser operations over the CDP selector engine ({@link MacroCdp}) + `TabManager`. Element-targeting
 * calls auto-wait (resolve a SelectorChain by polling) — the interpreter never sleeps to "wait" for an
 * element. Navigation reuses the app's scheme-allow-listed `navigateActive` path.
 *
 * The macro RUN as a whole is gated at the capability boundary (`macros_create_run` is state_changing
 * → HITL, ADR-0021); finer per-element-step PEP re-gating is a Phase-6 hardening follow-up.
 */
export interface MacroHostDeps {
  /** Read + parse a CSV blob (by content hash) into row records. Injected (blob store lives in main). */
  readCsv: (blobHash: string) => Promise<Record<string, string>[]>;
  /** Highlight resolved elements during replay (record/replay UX). Default true. */
  highlight?: boolean;
  /** Called on each cursor-position update during the run (CDP coords, view-relative). */
  onCursorMove?: (x: number, y: number) => void;
  /** Called after each action completes to hide the overlay cursor. */
  onCursorHide?: () => void;
}

function requireWc(): WebContents {
  const wc = TabManager.activeWebContents();
  if (wc === null) throw new AppError('No active tab for the macro run', 409);
  return wc;
}

export function createMacroHost(deps: MacroHostDeps): MacroHost {
  const highlightOn = deps.highlight ?? true;

  // One adapter per macro run — always created so all actions use human-like timing.
  // Cursor position is injected into the live page DOM (position:fixed, z-index:max).
  const adapter = new HumanInputAdapter(
    (method, params) => requireWc().debugger.sendCommand(method, params),
    (x, y) => {
      const wc = TabManager.activeWebContents();
      if (wc !== null) showPageCursor(wc, x, y);
      deps.onCursorMove?.(x, y);
    },
    undefined,
    isUserControlActive,
  );

  const resolve = async (chain: SelectorChain, timeoutMs?: number): Promise<number> => {
    const wc = requireWc();
    const id = await MacroCdp.resolveChain(wc, chain, timeoutMs);
    if (id === null) throw new AppError('element not found (selector chain did not resolve)', 404);
    if (highlightOn) await MacroCdp.highlight(wc, id);
    return id;
  };

  return {
    navigate: async (url) => {
      await browserHost.navigateActive(url); // scheme allow-list + settle enforced inside
    },
    click: async (chain) => {
      const wc = requireWc();
      await MacroCdp.click(wc, await resolve(chain), adapter);
      hidePageCursor(wc);
      deps.onCursorHide?.();
    },
    fill: async (chain, value) => {
      const wc = requireWc();
      await MacroCdp.fill(wc, await resolve(chain), value, adapter);
      hidePageCursor(wc);
      deps.onCursorHide?.();
    },
    press: async (key) => {
      const wc = requireWc();
      await MacroCdp.pressKey(wc, key, adapter);
      hidePageCursor(wc);
      deps.onCursorHide?.();
    },
    scroll: async (direction, amount) => {
      const wc = requireWc();
      await MacroCdp.scroll(wc, direction, amount, adapter);
      hidePageCursor(wc);
      deps.onCursorHide?.();
    },
    extract: async (chain, attr) => MacroCdp.extract(requireWc(), await resolve(chain), attr),
    waitFor: async (chain, timeoutMs) =>
      (await MacroCdp.resolveChain(requireWc(), chain, timeoutMs)) !== null,
    waitForLoad: (timeoutMs) =>
      new Promise<void>((resolve) => {
        const wc = TabManager.activeWebContents();
        if (wc?.isLoadingMainFrame() !== true) {
          resolve();
          return;
        }
        const done = (): void => {
          clearTimeout(timer);
          if (!wc.isDestroyed()) wc.removeListener('did-stop-loading', done);
          resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        wc.once('did-stop-loading', done);
      }),
    // A 0ms timeout makes resolveChain a single-shot existence check (no wait loop).
    elementExists: async (chain) => (await MacroCdp.resolveChain(requireWc(), chain, 0)) !== null,
    elementVisible: async (chain) => (await MacroCdp.resolveChain(requireWc(), chain, 0)) !== null,
    pageContainsText: async (text) => {
      const raw: unknown = await requireWc().executeJavaScript(
        'document.body ? document.body.innerText : ""',
        true,
      );
      return typeof raw === 'string' && raw.includes(text);
    },
    readCsv: (hash) => deps.readCsv(hash),
    highlight: async (chain) => {
      await resolve(chain);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
