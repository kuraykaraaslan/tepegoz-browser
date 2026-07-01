# Package Map & Extraction Roadmap

> **Status:** Living document — tick items as they land (`- [ ]` → `- [x]`), like `phases/`.
> **Decision record:** [ADR-0015](adr/0015-package-extraction-roadmap.md).

This is the **checkable catalog** of cohesive parts that currently live inside `apps/desktop` but
are self-contained enough to become their own `@tepegoz/*` package. We extract them **one at a time,
in separate PRs**, over the course of the project.

## Guiding principle

A **single desktop app** (`apps/desktop`) is retained. Reusable parts move into `packages/*` and the
app **consumes** them. Packages are `private: true` and **bundled** into Electron (never published to
npm — [ADR-0002](adr/0002-monorepo-pnpm-turborepo.md)), so extraction is low-risk and mechanical:
move code → add `package.json`/`tsconfig.json` → rewrite imports to `@tepegoz/<name>` → add a
`dependency-cruiser` layer rule.

## Already-extracted packages (do not re-do)

`packages/`: `shared-types`, `libs`, `i18n`, `persistence`, `ui`, `extension-sdk`, `ext-agent`,
`security-policy`, `capability-plane`, `model-gateway`, `orchestrator`, `tool-executor`, `native-rs`
(Rust placeholder). Layering (bottom-up): **foundation → utils → storage → policy → model/plan → app**.
Any new package must respect this graph and the no-circular rule in
[`dependency-cruiser.cjs`](../dependency-cruiser.cjs).

---

## Catalog A — UI chrome (renderer) candidates

| Done | Proposed package | Source (today) | Scope | Depends on | Effort |
|---|---|---|---|---|---|
| [x] | **@tepegoz/omnibox** ⭐ (`url-bar`) | ~~`Toolbar.tsx` + `omnibox-calc.ts`~~ → `packages/omnibox/` | Address-bar input + inline calc hint; navigate/copy via callbacks (no `window.tepegoz` coupling) | `@tepegoz/ui`, react (peer) | ✅ done |
| [x] | **@tepegoz/tab-strip** | ~~`renderer/src/components/TabStrip.tsx`~~ → `packages/tab-strip/` | Tab list: favicon fallback, wheel-scroll, container-query collapse; select/close/context-menu/new-tab via callbacks; `TabDescriptor` + `labels` (no i18n dep) | `@tepegoz/ui`, react (peer) | ✅ done |
| [x] | **@tepegoz/window-controls** | ~~`renderer/src/components/WindowControls.tsx`~~ → `packages/window-controls/` | Min/max/restore/close; pure view — `isMaximized` + labels + callbacks in; app keeps a `useWindowMaximized` hook for the subscription | react (peer), zero deps | ✅ done |
| [x] | **@tepegoz/nav-toolbar** | `Toolbar.tsx` split → `packages/nav-toolbar/` (`NavToolbar`); app keeps the extension tray/puzzle in an `actions` slot | Back/forward/reload + omnibox + actions slot + menu; all actions injected; exports `NAV_BTN` | `@tepegoz/omnibox`, react (peer) | ✅ done |
| — | ~~@tepegoz/browser-chrome~~ | `TitleBar.tsx` + composition | **Deprioritized — stays in app.** Now that tab-strip/window-controls/nav-toolbar/omnibox are packages, composing them (`TitleBar` + `Toolbar` in `App.tsx`) is thin app glue that wires all the `window.tepegoz` callbacks + tabs state + extension tray. A meta-package would need that entire callback surface injected — near-zero reuse value. | — | — |
| [x] | **@tepegoz/settings-ui** | `SettingsPage.tsx` split → `packages/settings-ui/` (`SettingsLayout` shell); app keeps `SettingsPage` content | Generic sidebar + cross-section search + content/banner slots; owns active/search state; all provider/theme/i18n content stays in the app | `@tepegoz/ui`, react (peer) | ✅ done |
| [x] | **@tepegoz/history-ui** | ~~`renderer/src/components/HistoryPage.tsx`~~ → `packages/history-ui/` | Search + newest-first list + delete/clear; owns search state, `list`/`remove`/`clear` data source injected; `HistoryItem` + labels (no i18n dep) | react (peer), zero deps | ✅ done |
| [x] | **@tepegoz/extensions-ui** | `ExtensionsPage.tsx` split → `packages/extensions-ui/` (`ExtensionsGrid` shell); app keeps registry/manifest mapping | Searchable card grid + toggles; `ExtensionCardItem` + labels + onToggle injected | `@tepegoz/ui`, react (peer) | ✅ done |

- **BrandMark** ✅ done — moved from `renderer/src/components/BrandMark.tsx` to
  `packages/ui/src/brand/BrandMark.tsx` (first-party, exported from the `@tepegoz/ui` barrel; kept out
  of the vendored `src/modules`/`src/libs` fork dirs). `TitleBar` now imports it from `@tepegoz/ui`.
- **omnibox-calc split (optional):** the pure arithmetic evaluator (`omnibox-calc.ts`, zero deps, fully
  tested) can become `@tepegoz/omnibox-calc`; otherwise keep it as an internal module of `@tepegoz/omnibox`.

## Catalog B — Main-process subsystem candidates

| Done | Proposed package | Source (today) | Scope | Depends on | Effort |
|---|---|---|---|---|---|
| [x] | **@tepegoz/navigation** ⭐ (url-bar's backend twin) | ~~`main/lib/navigation-url.ts` + `trusted-origin.ts`~~ → `packages/navigation/` (pure); app keeps thin adapters | Scheme allow-list, `tepegoz://` internal-page routing, search fallback, trusted-origin — pure TS; `isPackaged` + internal-page set **injected** by desktop adapters | none (zero-dep) | ✅ done |
| [x] | **@tepegoz/credential-vault** | ~~`main/security/credential-vault.ts`~~ → `packages/credential-vault/` | Encrypted BYO-key vault; `SecretCrypto` + file path injected (app wires safeStorage in `stores.electron.ts`); Electron-free, 9 tests | `@tepegoz/libs`, `shared-types`, `json-store` | ✅ done |
| [ ] | **@tepegoz/preferences** | `main/preferences/preference-store.ts` + `preferences.model.ts` | Zod schema + store core (path injected); minor refactor: make `ExtensionId` enum pluggable | zod, json-store, `@tepegoz/libs` | M |
| [x] | **@tepegoz/json-store** | ~~`main/lib/json-store.ts`~~ → `packages/json-store/` | Crash-safe file-based JSON persist (Node-only); used by credential-vault + preferences | none (Node fs) | ✅ done |
| [ ] | **@tepegoz/desktop-ipc** | `shared/ipc-contract.ts` + `shared/ipc-schemas.ts` | Typed IPC channel contract + zod validation (shared main+preload+renderer seam) | `@tepegoz/ext-agent` (types), `@tepegoz/persistence` (types), zod | S–M |
| [ ] | **@tepegoz/browser-tools** | `main/agent/builtin-tools.ts` + `main/agent/perception.ts` | Browser capability descriptors + page perception; needs a `WebContents`/TabManager boundary interface to decouple from Electron (sanitizer already in `tool-executor`) | `@tepegoz/capability-plane`, `@tepegoz/shared-types`, `@tepegoz/tool-executor`, `@tepegoz/security-policy` | M–L |
| [ ] | **@tepegoz/tab-engine** | `main/tabs.ts` | Tab lifecycle over `WebContentsView`. Heavy Electron coupling; needs boundary + pure-state refactor (long-term) | electron, `@tepegoz/persistence`, `@tepegoz/libs` | L |

## Catalog C — stays in `apps/desktop` (not candidates)

Electron-specific glue with low reuse value: `main/index.ts` (bootstrap), `main/window.ts`
(`createWindow` factory), `main/security.ts` (global hardening), `main/ipc.ts` (`ipcMain` wiring),
`main/menus/` (native `Menu` API — a testable menu-data model could be split out later),
`main/stores.electron.ts` (DI), `main/db/database.electron.ts` (thin init over `@tepegoz/persistence`).

---

## Package scaffold recipe (mirror existing packages)

For each new package (same shape as `@tepegoz/tool-executor` / `@tepegoz/ui`):

- `packages/<name>/package.json` → `private: true`, `type: "module"`,
  `exports`/`main`/`types` → `./src/index.ts`; scripts `typecheck`/`lint`/`test`/`build`.
  React packages declare `react`/`react-dom` as **peerDependencies**.
- `packages/<name>/tsconfig.json` → `{ "extends": "../../tsconfig.base.json", …, "noEmit": true }`.
- `packages/<name>/src/index.ts` → barrel export.
- Add the workspace dep to `apps/desktop/package.json`; rewrite moved imports to `@tepegoz/<name>`.
- Add the package's layer rule to [`dependency-cruiser.cjs`](../dependency-cruiser.cjs) (per its
  "added as those packages land" note) — no cycles, no wrong-direction imports.
- **i18n:** UI packages take `Resources`/`t` via props (no hardcoded strings); keep catalog keys in
  `@tepegoz/i18n` (en + tr parity) in the same PR.

## Extraction order (waves)

- [x] **Wave 0 — quick wins (pure / low-coupling):** `@tepegoz/navigation`,
  `@tepegoz/omnibox` (+ calc), `@tepegoz/json-store`, BrandMark → `@tepegoz/ui`. ✅ done.
- [x] **Wave 1 — UI chrome:** `tab-strip`, `window-controls`, `nav-toolbar`, `history-ui`,
  `extensions-ui`, `settings-ui`. ✅ done. (`browser-chrome` deprioritized — stays in app, see Catalog A.)
- [ ] **Wave 2 — security/state cores:** ✅ `credential-vault` · ⬜ `preferences`, `desktop-ipc`.
- [ ] **Wave 3 — needs boundary refactor (Phase 1b/2b):** `browser-tools`, `tab-engine`.

## Per-package Definition of Done (when a package is actually extracted)

- `pnpm --filter @tepegoz/<name> typecheck lint test build` — green.
- Root `pnpm depcruise` — no new cycles / wrong-direction imports.
- `pnpm exec turbo run build --filter=@tepegoz/desktop && pnpm e2e` — Playwright smoke green.
- i18n en + tr parity for any moved user-facing strings, in the same PR.
