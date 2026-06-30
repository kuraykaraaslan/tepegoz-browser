# Phase 2b — Daily-Driver Browser UX (Tabs / PWA / DevTools)

**Status:** ⬜ Not started  ·  **Estimate:** ~3–4 months  ·  **Depends on:** Phase 1a (UI shell)
**Goal:** Make tepegoz a credible everyday browser, not just an agentic shell: advanced tab UX,
PWA support, and a full developer-tools surface. **Can run in parallel with Phase 2** (both are
post-core daily-driver tracks). Classic browser-UX features only — agent-adjacent privacy/credential
work lives in Phase 2; agent orchestration (multi-tab parallelism) stays in Phase 1b.
**Branch examples:** `feat/tab-workspaces`, `feat/pwa-support`, `feat/devtools-surface`...

## Exit criteria (DoD)
- [ ] Tab groups + split view + workspaces + full session restore (named sessions, recently-closed, multi-window) work
- [ ] One PWA installs + works offline + receives a push (under the permission guard) end-to-end
- [ ] DevTools opens with all panels (network/perf/memory/console/a11y/security/storage) + device emulation; **agent has no DevTools tool**; blocked on sensitive sites
- [ ] **i18n:** en+tr keys added for new surfaces (tab/workspace UI, PWA install/permission prompts, DevTools menu)
- [ ] ADRs accepted for: Tab Boundary Model, PWA security model, DevTools expose boundary (no code before acceptance)
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe

## Tasks

### L9 — Advanced tab system
- [ ] Tab groups (color/name/collapse), **split view** (2+ tabs side-by-side in one window), **workspaces** (named tab sets; distinct from Phase 3 multi-profile — profile ≠ workspace), **full session restore** (named sessions, recently-closed list, multi-window restore). _(Vertical tabs out of scope.)_
- [ ] Builds on Phase 1a basic tab shell + basic restore; does NOT clash with Phase 1b agent multi-tab parallelism (that is internal orchestration; this is user-facing UI). **ADR required — "Tab Boundary Model"**: the `BrowserContext` boundary of workspace/split-view; user-facing grouping must NOT leak agent-branch policy isolation.

### L9 — PWA support
- [ ] Web app manifest parse + **install** (app icon, standalone window), **service worker** lifecycle, **offline** operation, **push notification**, **background sync**.
- [ ] Security: PWA permissions (notification/background/install) routed through the single **Policy/PermissionGuard** (same engine as Phase 2 `PopupAndPermissionGuard`); renderer-untrusted assumption preserved; offline cache encrypted (`safeStorage` standard). **ADR required** (highest risk): service worker allowlist/gating, controlled install/standalone, background sync as policy-gated event, push OFF by default. **No code before ADR acceptance.**

### Developer Tools (built-in Chromium, exposed)
- [ ] Securely expose Chromium's built-in DevTools per `WebContentsView` (network/performance/memory/console/accessibility/security/storage panels come free from Chromium) + **device/mobile emulation**.
- [ ] Open via menu + shortcut (F12 / Ctrl+Shift+I); triggered from main process without leaking privilege to the renderer. Do NOT write custom panels. **ADR required** (DevTools expose boundary): exposed to the **user** but **NOT as an agent tool** (no `devtools_*` in the Capability Plane); blocked on sensitive sites (bank/crypto/health/password-manager); device-emulation state recorded as a journal observation; reconcile with production hardening fuses (`disableDebugger`).

### Cross-cutting (as in every phase)
- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/trust boundary; AppError contract; renderer-untrusted security; DoD coverage gate; **NO AI attribution trailer** in commits/PRs.
