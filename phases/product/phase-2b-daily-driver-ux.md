# Phase 2b — Daily-Driver Browser UX (Tabs / PWA / DevTools)

**Status:** 🟡 In progress (DevTools boundary + ADR-0029 + Task-Manager accounting landed 2026-08-19) · **Estimate:** ~3–4 months · **Depends on:** Phase 1a (UI shell)
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
  **Not done:** the menu entry, the F12 / Ctrl+Shift+I accelerator, device emulation, and the
  `disableDebugger` reconciliation.
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

- [ ] **Default-browser registration** (`app.setAsDefaultProtocolClient` for http/https + OS default-apps
      prompt); inbound links from other apps open in the **existing** window via the `second-instance` handler
      already wired in Phase 1a — a new window only when none is open.
- [ ] **Tab discard / sleep** (background-tab suspension + reload-on-focus) to cap memory — distinct from the
      Phase 1b agent-context eviction (that is per-task _agent_ memory; this is _browser-tab_ lifecycle).
- [~] **Task Manager** (`app.getAppMetrics` → per-`WebContentsView` CPU / memory / PID; end-process; shows
  which tabs are discarded) surfaced as an internal `tepegoz://` page.

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/trust boundary; AppError contract; renderer-untrusted security; DoD coverage gate; **NO AI attribution trailer** in commits/PRs.
