import { AppError } from '@tepegoz/libs';
import type { WebContents } from 'electron';
import type { MacroHost, MacroPolicyStepKind } from '@tepegoz/macro-engine';
import { PolicyDeniedError } from '@tepegoz/macro-engine';
import type { Selector, SelectorChain } from '@tepegoz/shared-types';
import { HumanInputAdapter } from '@tepegoz/human-input';
import { PolicyKernel } from '@tepegoz/security-policy';
import TabManager from '../tabs';
import MacroCdp from '../agent/macro-cdp.electron';
import { browserHost } from '../agent/browser-host.electron';
import { showPageCursor, hidePageCursor, isUserControlActive } from '../agent/page-cursor.electron';

/** Bounded resolve attempt for a HEALED (single-candidate) chain — never the run's own `waitFor` wait. */
const HEAL_RESOLVE_TIMEOUT_MS = 3_000;

/** A `checkPolicy` "ask" needing a fresh (mid-run) confirmation — a NEWLY elevated risk that the
 *  run-start approval couldn't have foreseen (a step landed on a sensitive site, or a value about to
 *  be used came from `extract`ed page content). */
export interface MacroPolicyAskRequest {
  kind: MacroPolicyStepKind;
  reason: string;
  targetUrl: string;
  biometric: boolean;
}

/**
 * Desktop {@link MacroHost} for `@tepegoz/macro-engine`: implements the deterministic runtime's
 * browser operations over the CDP selector engine ({@link MacroCdp}) + `TabManager`. Element-targeting
 * calls auto-wait (resolve a SelectorChain by polling) — the interpreter never sleeps to "wait" for an
 * element. Navigation reuses the app's scheme-allow-listed browser navigation path.
 *
 * The macro RUN as a whole is gated at the capability boundary (`macros_create_run` is state_changing
 * → HITL, ADR-0021). On top of that, `checkPolicy` re-passes the same deterministic Policy Kernel (L8)
 * before every state-changing step against the CURRENT page: the baseline "this is a state change" ask
 * is already covered by that run-start approval, so only a NEWLY elevated reason (sensitive-site
 * lockout, a tainted value about to be used) re-gates here — a hard `deny` for lockout, an `ask` for
 * everything else, defaulting to fail-CLOSED (denied) when no `confirmPolicyAsk` is wired.
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
  /** Resolve a mid-run policy "ask". Omit (or resolve false) to fail closed — the step is denied and
   *  the run stops, same as ToolGateway's HITL default with no confirm handler wired. */
  confirmPolicyAsk?: (req: MacroPolicyAskRequest) => Promise<boolean>;
  /** M2 self-healing selector: ONE scoped model call, tried only after the deterministic chain fails
   *  to resolve. Omit (or resolve `null`) to keep today's behaviour — fail with the exact predicate. */
  healSelector?: (chain: SelectorChain) => Promise<Selector | null>;
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
    if (id !== null) {
      if (highlightOn) await MacroCdp.highlight(wc, id);
      return id;
    }
    // M2 self-heal: ONE scoped attempt with a fresh, model-proposed single-candidate chain, before
    // giving up. No healer wired, a decline, or a still-unresolved heal all fall through to the SAME
    // exact-predicate error the caller (macro-engine) reports as the located failure.
    const healed = deps.healSelector === undefined ? null : await deps.healSelector(chain).catch(() => null);
    if (healed !== null) {
      const healedId = await MacroCdp.resolveChain(wc, [healed], HEAL_RESOLVE_TIMEOUT_MS);
      if (healedId !== null) {
        if (highlightOn) await MacroCdp.highlight(wc, healedId);
        return healedId;
      }
    }
    throw new AppError('element not found (selector chain did not resolve)', 404);
  };

  return {
    navigate: async (url) => {
      await browserHost.navigate(url); // scheme allow-list + settle enforced inside
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
    checkPolicy: async (kind, tainted) => {
      const targetUrl = requireWc().getURL();
      const policy = PolicyKernel.evaluate({
        descriptor: { id: `macro_${kind}`, dangerClass: 'state_changing' },
        taintedArgs: tainted,
        targetUrl,
      });
      if (policy.decision === 'deny') {
        throw new PolicyDeniedError(`Blocked by policy: ${policy.reason}`);
      }
      // 'state_change_confirm' is the baseline ask for any state-changing step — already covered by
      // the run-start HITL approval (macros_create_run). Only a NEWLY elevated reason re-prompts here.
      if (policy.decision === 'ask' && policy.reason !== 'state_change_confirm') {
        const approved =
          deps.confirmPolicyAsk !== undefined &&
          (await deps.confirmPolicyAsk({ kind, reason: policy.reason, targetUrl, biometric: policy.biometric }));
        if (!approved) {
          throw new PolicyDeniedError(`Denied at confirmation: ${policy.reason}`);
        }
      }
    },
  };
}
