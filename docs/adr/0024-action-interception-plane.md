# ADR-0024: Synchronous action-interception plane for browser-mechanics hooks

- **Status:** Accepted
- **Date:** 2026-07-06
- **Refines:** [ADR-0021](0021-agent-controllable-extensions.md) (in-process extension capability
  providers) · **complements** [ADR-0010](0010-ts-tooling-conventions.md) (TS/tooling conventions)

## Context

`apps/desktop`'s core browsing mechanics — opening a popup (`WebContents.setWindowOpenHandler`),
creating/closing a tab (`TabManager.createTab`/`closeTab`), and navigating (`will-navigate`/
`will-redirect`) — used to hardcode extension-specific policy inline. The Popup Blocker (strict)
extension's entire decision (settings, trusted-origin allowlist, block predicate, "blocked"
notification) lived in `apps/desktop/src/main/popup-blocker.ts`, a desktop-owned class `TabManager`
called directly. That is the wrong owner: an extension's behavior should live in the extension, and
desktop core should own only the mechanics of *performing* an action, not the policy for *whether*
to perform it.

ADR-0021 already solved the analogous problem for **agent-invokable tools**: an extension declares
capabilities via `@tepegoz/extension-sdk`, an `ExtensionCapabilitySupervisor` registers the enabled
set into the single `CapabilityRegistry` behind the `ToolGateway` PEP. That mechanism is **async by
design** (the gateway awaits handlers, runs policy/HITL/audit) and is reachable only through the
agent's tool-call path — it cannot serve `setWindowOpenHandler`, `will-navigate`, or a plain method
call like `TabManager.createTab`, all of which are triggered by ordinary browsing, not by the agent.

A separate constraint rules out reusing anything async here: **Electron 33's
`WebContents.setWindowOpenHandler` and the `will-navigate`/`will-redirect` events only accept a
synchronous verdict** — there is no `Promise`-returning overload, and `event.preventDefault()` must
be called synchronously within the listener. Any interception plane covering these mechanics is
therefore synchronous by necessity, not by choice.

## Decision

1. **A synchronous interceptor contract in `@tepegoz/extension-sdk`** (`action-interceptors.ts`). A
   fixed, closed union `ActionType` (`'popup:open' | 'tab:create' | 'tab:close' |
   'navigation:navigate'`, `domain:kebab-action` — matching `IpcChannels`' naming convention) is the
   single source of truth; each member has a typed `ActionContext[T]`. An extension declares
   interceptors with `defineActionInterceptors(extensionId, [{ actionType, shouldBlock, onBlocked? }])`
   — `shouldBlock` MUST be synchronous and side-effect-free; `onBlocked` is a separate, optional side
   effect (e.g. raise a notification) that runs once, only when `shouldBlock` returned `true`.
2. **Every action type is synchronous, including the two that aren't themselves Electron-constrained**
   (`tab:create`/`tab:close`). One uniform contract is simpler for an extension author to learn than a
   plane that's synchronous for some actions and async for others; async support can be added later
   for genuinely async-safe action types without breaking this contract (`shouldBlock`'s signature is
   additive-compatible with a future `Promise<boolean>` union member, scoped to new action types only).
3. **`@tepegoz/extension-host` provides `ActionInterceptorSupervisor`** — simpler than its agent-plane
   sibling (`ExtensionCapabilitySupervisor`): there is no persistent registry an agent planner
   enumerates, so `evaluate(actionType, ctx)` checks the extension's enabled state **live, on every
   call** instead of register/unregister + `reconcile()`. The first enabled interceptor that returns
   `true` wins; `false` (allow) when none is registered or enabled for that action type — core
   browsing never depends on any extension being installed.
4. **`apps/desktop/src/main/extensions/action-interceptors.electron.ts`** wires the enabled-check to
   `isExtensionEnabled(PreferenceStore.getAll().extensions, id)` — the same gate ADR-0021's supervisor
   and `mcp/config-source.ts` already use — and exposes `ActionInterceptorService.provide`/
   `.shouldBlock` as the one thing `TabManager` imports. `TabManager` calls `shouldBlock` at each of
   the four mechanical points (two `setWindowOpenHandler`s, `createTab`, `closeTab`, `will-navigate`/
   `will-redirect`) and stays completely oblivious to which extension, if any, answers.
5. **Popup Blocker (strict) is the first (and today, only) consumer.** Its full decision logic moved
   from `apps/desktop/src/main/popup-blocker.ts` into `extensions/ext-popup-blocker/src/host.ts`
   (`createPopupBlockerHost`, Electron-free — preference persistence and notification delivery are
   injected ports), which registers one `popup:open` interceptor. `tab:create`/`tab:close`/
   `navigation:navigate` are wired at their mechanical points with no registered interceptor yet — the
   hooks are real and tested, but inert until an extension opts in.

## Consequences

- Extension behavior for these four actions now lives entirely in the extension package; `TabManager`
  and `apps/desktop`'s IPC layer only call the generic `ActionInterceptorService`, never a
  per-extension class. A disabled or absent extension degrades to plain-browser behavior (nothing is
  ever blocked) — verified by `ActionInterceptorSupervisor`'s unit tests and `host.ts`'s own tests.
- `TabManager.createTab` now returns `string | null` (`null` = blocked). Call sites that use the
  returned id (`createTabRight`, `duplicateTab`, `newTabInGroup`, `restoreSession`,
  `AgentTabGroup.openTab`) handle `null` explicitly; `AgentTabGroup.openTab` throws (surfaced to the
  agent as a failed tool call) since its own contract (`BrowserHost.createTab(): string`) predates
  this ADR and has no real consumer to justify widening yet.
- A future action type that genuinely needs an async verdict (e.g. "confirm before closing an
  unsaved-work tab") is out of scope here — it would need its own dispatch path, since
  `setWindowOpenHandler`/`will-navigate` can never be that path (see Context).
