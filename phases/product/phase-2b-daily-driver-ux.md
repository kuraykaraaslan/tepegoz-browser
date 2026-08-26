# Phase 2b — Daily-Driver Browser UX (Tabs / PWA / DevTools)

**Status:** 🟡 In progress (DevTools boundary + ADR-0029 + Task-Manager accounting landed 2026-08-19; the app-owned application menu closed the Ctrl+Shift+I bypass 2026-08-24; default-browser registration + inbound-link routing + tab discard/sleep landed 2026-08-26 — **the v1 ship line's narrow 2b scope (default-browser + tab discard + tab groups) is now code-complete**) · **Estimate:** ~3–4 months · **Depends on:** Phase 1a (UI shell)
**Goal:** Make tepegoz a credible everyday browser, not just an agentic shell: advanced tab UX,
PWA support, and a full developer-tools surface. **Can run in parallel with Phase 2** (both are
post-core daily-driver tracks). Classic browser-UX features only — agent-adjacent privacy/credential
work lives in Phase 2; agent orchestration (multi-tab parallelism) stays in Phase 1b.
**Branch examples:** `feat/tab-workspaces`, `feat/pwa-support`, `feat/devtools-surface`...

## Exit criteria (DoD)

- [ ] Tab groups + split view + workspaces + full session restore (named sessions, recently-closed, multi-window) work
- [ ] One PWA installs + works offline + receives a push (under the permission guard) end-to-end
- [ ] DevTools opens with all panels (network/perf/memory/console/a11y/security/storage) + device emulation; **agent has no DevTools tool**; blocked on sensitive sites
- [ ] **Default-browser registration** works (http/https handler + inbound-link routing to the existing window) and a **Task Manager** shows per-tab CPU/memory via `app.getAppMetrics`
- [ ] **i18n:** en+tr keys added for new surfaces (tab/workspace UI, PWA install/permission prompts, DevTools menu, default-browser prompt, Task Manager)
- [ ] ADRs accepted for: Tab Boundary Model, PWA security model, DevTools expose boundary (no code before acceptance)
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe

## Landed so far (2026-08-19)

- **DevTools expose boundary** — [ADR-0029](../../docs/adr/0029-devtools-expose-boundary.md) accepted, and
  the gate ([devtools-policy.ts](../../packages/security-policy/src/devtools-policy.ts)) is wired at the one
  place DevTools opens. It reuses the **same** sensitive-site list the kernel locks automation out of.
  This also closed something already shipping: "Inspect element" had been opening DevTools on any page,
  including a bank. A committed test asserts no `devtools_*` tool exists in the Capability Plane.
  **Not done:** device emulation and the `disableDebugger` reconciliation.
  - **Correction (2026-08-24) — two claims above were false, and the second was a live hole.** This
    entry used to end "**Not done:** the menu entry, the F12 / **Ctrl+Shift+I accelerator**, …", and
    `openDevToolsActive` described itself as "the single place DevTools is opened, so the sensitive-site
    gate cannot be routed around by a new caller". Neither held. **Ctrl+Shift+I was not "not done" — it
    was live, and it was not ours.** Electron installs a DEFAULT application menu when an app never
    calls `Menu.setApplicationMenu`, and this app never did; measured in the running app,
    `Menu.getApplicationMenu()` returned a menu binding `Toggle Developer Tools=Ctrl+Shift+I` to
    Electron's own role, which acts on the focused webContents and consults nothing. So the one keyboard
    shortcut every developer types by reflex opened a live console on a banking page, while
    `TabManager.toggleDevTools` — the gated path this bullet is about — had **zero callers**. The gate
    was real, unreachable, and stepped around. Writing "not done" for a key that was already bound is
    the failure mode worth naming: the roadmap was tracking OUR code and the platform had supplied a
    binding underneath it. **Fixed:** [menus/application-menu.ts](../../apps/desktop/src/main/menus/application-menu.ts)
    now sets the menu explicitly — none at all on Windows/Linux, where the frameless windows never drew
    a menu bar and it existed purely as an invisible second binder, and a minimal editing-roles-only
    menu on macOS, which genuinely loses ⌘C/⌘V without one. Ctrl+Shift+I is registered in
    `@tepegoz/shortcuts` and dispatched through `toggleDevToolsGated`, giving the gate its first caller.
    **Two more of the default menu's roles were wrong for this app** and went with it: the zoom roles
    bypassed `site-zoom.ts`'s per-origin ladder (two implementations of one key, and which won was
    chosen by nobody), and `close` closed the WINDOW where a browser closes a tab — Ctrl+W now closes
    the tab. Locked by [e2e/application-menu.spec.ts](../../e2e/application-menu.spec.ts), which asks the
    LAUNCHED app what its menu is, because the defect was the absence of a call and Electron supplies
    the default silently — no unit test can see that. It earned its keep immediately: run against the
    pre-fix build it failed on exactly this assertion. 13 unit tests cover the gate's own verdicts
    (every sensitive category refuses and does not open anyway; an ordinary page toggles).
- **Task-Manager accounting** — [task-metrics.ts](../../packages/tab-engine/src/task-metrics.ts) maps
  Electron's per-PROCESS metrics onto TABS honestly: Chromium groups same-site tabs into one renderer, so
  shared rows are flagged and report the process total as such rather than an invented per-tab share, and
  the memory total is computed from distinct processes so sharing is never double-counted. An unmeasurable
  tab reports `null`, never `0`. **Not done:** the `tepegoz://` page, end-process, and tab discard/sleep.

## Tasks

### L9 — Advanced tab system

- [ ] Tab groups (color/name/collapse), **split view** (2+ tabs side-by-side in one window), **workspaces** (named tab sets; distinct from Phase 3 multi-profile — profile ≠ workspace), **full session restore** (named sessions, recently-closed list, multi-window restore). _(Vertical tabs out of scope.)_
- [ ] Builds on Phase 1a basic tab shell + basic restore; does NOT clash with Phase 1b agent multi-tab parallelism (that is internal orchestration; this is user-facing UI). **ADR required — "Tab Boundary Model"**: the `BrowserContext` boundary of workspace/split-view; user-facing grouping must NOT leak agent-branch policy isolation. _(ADR written + Accepted: [ADR-0020](../../docs/adr/0020-tab-boundary-model.md), incl. the 2026-07-06 addendum introducing `TabGroupInfo.settings` as the standard **binding/UI** seam — `agent.panelOpen` today, `vpn.connectionId`/`tor.enabled` reserved for Phase 5.)_

> **What a tab group may and may not carry (ADR-0020, restated because it keeps being asked).** Two
> features legitimately vary per group: the **agent conversation** (already group-keyed end to end —
> see the concurrency-blockers note in [Phase 1b](phase-1b-agentic-deepening.md)) and the **VPN/Tor
> binding** (Phase 5's three-scope `tab → group → General → Direct`). Both are bindings, not boundaries:
> the partition axis stays `(profile, connection)` and the policy axis stays the Policy Kernel/ToolGateway
> PEP. **Per-group autonomy levels, permission grants, or trust profiles are therefore out of scope by
> design, not merely unbuilt** — group membership is user-mutable chrome UI and must never be readable as
> a policy scope. Two lifecycle facts any group-scoped feature has to handle: `normalize()` **prunes an
> empty group** (so group id ≠ durable feature key), and pinning a tab clears its group membership.

### L9 — PWA support

- [ ] Web app manifest parse + **install** (app icon, standalone window), **service worker** lifecycle, **offline** operation, **push notification**, **background sync**.
- [ ] Security: PWA permissions (notification/background/install) routed through the single **Policy/PermissionGuard** (same engine as Phase 2 `PopupAndPermissionGuard`); renderer-untrusted assumption preserved; offline cache encrypted (`safeStorage` standard). **ADR required** (highest risk): service worker allowlist/gating, controlled install/standalone, background sync as policy-gated event, push OFF by default. **No code before ADR acceptance.**

### Developer Tools (built-in Chromium, exposed)

- [~] Securely expose Chromium's built-in DevTools per `WebContentsView` (network/performance/memory/console/accessibility/security/storage panels come free from Chromium) + **device/mobile emulation**.
- [~] Open via menu + shortcut (F12 / Ctrl+Shift+I); triggered from main process without leaking privilege to the renderer. Do NOT write custom panels. **[ADR-0029](../../docs/adr/0029-devtools-expose-boundary.md) accepted** (DevTools expose boundary): exposed to the **user** but **NOT as an agent tool** (no `devtools_*` in the Capability Plane); blocked on sensitive sites (bank/crypto/health/password-manager); device-emulation state recorded as a journal observation; reconcile with production hardening fuses (`disableDebugger`).

### L8 — OS integration & diagnostics

- [x] **Default-browser registration** (`app.setAsDefaultProtocolClient` for http/https + OS default-apps
      prompt); inbound links from other apps open in the **existing** window via the `second-instance` handler
      already wired in Phase 1a — a new window only when none is open.
      — _User-initiated only, from a Settings → General row (`getDefaultBrowserStatus`/`setAsDefaultBrowser`,
      `apps/desktop/src/main/default-browser.ts`): registering unprompted would rewrite the OS default the
      moment the page renders, which is the surprise this DoD line's own "OS default-apps prompt" phrasing
      is there to avoid. Both `http` and `https` are registered together — a browser that only claimed one
      would silently lose the other's links to whatever handled them before — and the reported status is
      always a fresh `app.isDefaultProtocolClient` read, never an assumption that the request succeeded
      (Windows 10+'s own picker decides)._
      — _**Inbound routing covers all three arrival paths**, not just the one the DoD line names:
      `second-instance`'s `commandLine` (Windows/Linux, app already running — `extractLaunchUrl`, tested)
      opens the link in the existing window exactly as specified; a **cold launch already carrying the
      link** (`process.argv`) was the gap the DoD text didn't mention but a real default-browser click
      hits every time, so `whenReady`'s bootstrap now checks for one and skips the ordinary
      restore/new-tab seed when it finds it; macOS's `open-url` is wired too, registered before
      `whenReady` and queued if it fires during a cold launch. 14 unit tests (`launch-url.test.ts` +
      `default-browser.test.ts`)._
- [x] **Tab discard / sleep** (background-tab suspension + reload-on-focus) to cap memory — distinct from the
      Phase 1b agent-context eviction (that is per-task _agent_ memory; this is _browser-tab_ lifecycle).
      — _`WindowTabsDiscard` (`tabs-window-discard.ts`) destroys a background tab's `WebContentsView`
      (`discardTab`) and rebuilds it on the next `activate()`, reloading its last known URL — the tab
      entry (title/favicon/url) stays in the strip the whole time, so nothing looks closed. Two paths
      trigger it: the tab context menu's new "Discard tab" row, and a once-a-minute auto-sweep
      (`tab-discard-service.ts`) gated on a default-ON preference (`tabDiscardEnabled`,
      `tabDiscardIdleMinutes`, default 30 — Chrome's own memory-saver default) exposed in Settings →
      General. **A discarded tab revives on the SAME browsing session it was discarded from**
      (`WindowTabsRehost.sessionOfTab`, captured before teardown) — reviving onto the window's plain
      default would silently drop a Phase 5 VPN/Tor-bound tab back onto the clear path, the exact leak
      class `rehostTab`'s own docs warn against, just triggered by sleep instead of a re-bind. Never
      applies to the active tab, a `hidden` (agent-kept-alive) tab, or one playing audio — `canDiscard`
      is the single guard both the menu row's `enabled` state and the sweep consult, so neither can drift
      from the other. Polling over an activation-event hook: the tab model already exposes full live
      state every tick, and a new observer just for this one caller would be more plumbing than the
      feature is worth. 5 unit tests on the sweep's timing/reset/leak-forgetting behavior — the
      Electron-view half is exercised the same way `rehostTab` is (no direct unit test; e2e territory)._
- [~] **Task Manager** (`app.getAppMetrics` → per-`WebContentsView` CPU / memory / PID; end-process; shows
  which tabs are discarded) surfaced as an internal `tepegoz://` page.

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/trust boundary; AppError contract; renderer-untrusted security; DoD coverage gate; **NO AI attribution trailer** in commits/PRs.
