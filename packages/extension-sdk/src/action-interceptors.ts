import { EXTENSION_ID_RE } from './manifest';

/**
 * Synchronous action-interception contract for internal extensions (ADR-0022). An extension MAY
 * declare interceptors — allow/deny predicates for browser actions the main process is about to
 * perform — that register into the single `ActionInterceptorSupervisor` consulted at each action's
 * mechanical execution point (window-open, tab create/close, navigation). Unlike agent capabilities
 * (ADR-0021, async, behind the `ToolGateway` PEP), interceptors run INLINE and MUST be synchronous:
 * `WebContents.setWindowOpenHandler` and the `will-navigate`/`will-redirect` events are Electron APIs
 * that only accept a synchronous verdict (no `Promise`-returning overload) — so every action type in
 * this plane is synchronous, including `tab:create`/`tab:close` (which aren't themselves
 * Electron-constrained), for one uniform contract extension authors only have to learn once.
 *
 * The package stays Electron-free: the concrete action contexts are constructed, and the enabled-set
 * gate is applied, by the main process at dispatch time (see `@tepegoz/extension-host`'s
 * `ActionInterceptorSupervisor` and `apps/desktop/src/main/extensions/action-interceptors.electron.ts`).
 */

/** The fixed set of interceptable actions, `domain:kebab-action` (matches `IpcChannels`' naming
 *  convention). Add a new action type here + its {@link ActionContext} entry when a new mechanical
 *  point needs to be interceptable — this union is the single source of truth the supervisor keys
 *  off, so a typo is a compile error rather than a silently-inert interceptor. */
export type ActionType = 'popup:open' | 'tab:create' | 'tab:close' | 'navigation:navigate';

/** Per-action-type context passed to a handler. Deliberately not a discriminated union on a shared
 *  `type` field — the caller already knows which {@link ActionType} it's dispatching (it's the
 *  supervisor's `evaluate` type parameter), so a handler's parameter is just `ActionContext[T]`. */
export interface ActionContext {
  /** An unsolicited `window.open`/`target=_blank` the page didn't earn via a recent user gesture. */
  'popup:open': { sourceOrigin: string; url: string };
  /** A new tab is about to be created (link click, Ctrl+T, agent, session restore, ...). */
  'tab:create': { url: string; openerId: string | null; background: boolean };
  /** An existing tab is about to be closed. */
  'tab:close': { tabId: string; url: string };
  /** A tab's top-level frame is about to navigate (initial load or a server redirect hop). */
  'navigation:navigate': { tabId: string; url: string; isRedirect: boolean };
}

/** Author-facing definition of one interceptor. `onBlocked` is a separate, optional side effect
 *  (e.g. raise a notification) invoked only when `shouldBlock` returned `true` for that exact call —
 *  kept separate so `shouldBlock` stays a pure, side-effect-free predicate the supervisor is free to
 *  call without worrying about double-firing a notification. */
export interface ActionInterceptorDef<T extends ActionType> {
  actionType: T;
  /** True = block this action. MUST be synchronous and side-effect-free (see module doc — the
   *  Electron APIs this feeds are not awaitable). */
  shouldBlock: (ctx: ActionContext[T]) => boolean;
  /** Runs once, only immediately after `shouldBlock` returned `true` for this same call. */
  onBlocked?: (ctx: ActionContext[T]) => void;
}

/** A normalized interceptor, stamped with the extension id that owns it (for the enabled-set gate). */
export interface ActionInterceptor<T extends ActionType = ActionType> {
  extensionId: string;
  actionType: T;
  shouldBlock: (ctx: ActionContext[T]) => boolean;
  onBlocked: ((ctx: ActionContext[T]) => void) | undefined;
}

/** Distributes `ActionInterceptorDef` over every member of {@link ActionType} individually, instead
 *  of instantiating the generic once with the whole union — the difference matters because it's what
 *  lets a heterogeneous array literal hold one `ActionInterceptorDef<'popup:open'>` next to an
 *  `ActionInterceptorDef<'tab:close'>` without TS widening every element's `shouldBlock` to accept ALL
 *  four context shapes. */
type AnyActionInterceptorDef = { [T in ActionType]: ActionInterceptorDef<T> }[ActionType];

/** The interceptor set contributed by one extension (its id + its normalized interceptors). Stored as
 *  the default-generic `ActionInterceptor` (not the per-member union) so a consumer indexing one out
 *  can call its `shouldBlock` with any single context shape — the supervisor re-narrows by actionType. */
export interface ActionInterceptorSet {
  extensionId: string;
  interceptors: readonly ActionInterceptor[];
}

/**
 * Declare an extension's action interceptors (validated — throws on an invalid extension id, a
 * dev-time contract like {@link defineExtension}). Stamps `extensionId` on every interceptor so the
 * supervisor can gate it on that extension's enabled state.
 */
export function defineActionInterceptors(
  extensionId: string,
  interceptors: readonly AnyActionInterceptorDef[],
): ActionInterceptorSet {
  if (!EXTENSION_ID_RE.test(extensionId)) {
    throw new Error(`defineActionInterceptors: invalid extension id "${extensionId}"`);
  }
  return {
    extensionId,
    // Spreading a union-typed `def` re-widens `actionType`/`shouldBlock` independently, losing the
    // per-member correlation TS can't re-derive structurally — hence the one explicit cast.
    interceptors: interceptors.map(
      (def) =>
        ({
          extensionId,
          actionType: def.actionType,
          shouldBlock: def.shouldBlock,
          onBlocked: def.onBlocked,
        }) as unknown as ActionInterceptor,
    ),
  };
}
