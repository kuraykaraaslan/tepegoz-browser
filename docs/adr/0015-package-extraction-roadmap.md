# ADR-0015: Package extraction roadmap — cohesive parts of `apps/desktop` become `packages/*`

- **Status:** Accepted
- **Date:** 2026-07-01

## Context
`apps/desktop` has accumulated several cohesive, self-contained parts that are logically packages in
their own right — the omnibox/`url-bar` (`Toolbar.tsx` + `omnibox-calc.ts`), the tab strip, window
controls, navigation-URL parsing (`navigation-url.ts`, pure TS), the credential vault, the preferences
store, and more. The monorepo already has a mature, consistent `@tepegoz/*` package pattern (12
packages, [ADR-0002](0002-monorepo-pnpm-turborepo.md)), so the extraction desen is established. We want
a durable, checkable decision about **which seams are packages** and **how** to carve them, so the work
can proceed one PR at a time across sessions without re-litigating scope.

## Decision
- **One desktop app is retained.** `apps/desktop` stays the single application; reusable parts move into
  `packages/*` and the app **consumes** them. We do **not** split into multiple apps.
- **The seams to extract are catalogued in [`docs/package-map.md`](../package-map.md)** (a living
  tick-list): UI chrome (omnibox, tab-strip, window-controls, nav-toolbar, browser-chrome, settings-ui,
  history-ui, extensions-ui) and main-process subsystems (navigation, credential-vault, preferences,
  json-store, desktop-ipc, browser-tools, tab-engine). That doc also records what **stays in the app**
  (Electron-specific glue: bootstrap, `createWindow`, global hardening, `ipcMain` wiring, native menus,
  DI, DB init) and what is **already a package**.
- **Extraction is mechanical and low-risk** because packages are `private: true` and **bundled** into
  Electron, not published (ADR-0002): move code → add `package.json` + `tsconfig.json` (extends the base)
  → rewrite imports to `@tepegoz/<name>` → add a [`dependency-cruiser`](../../dependency-cruiser.cjs)
  layer rule. React packages take
  `react`/`react-dom` as peers; UI packages take i18n `Resources` via props (no hardcoded strings).
- **Order by dependency, not by number:** Wave 0 pure/quick wins (navigation, omnibox, json-store,
  BrandMark→ui) → Wave 1 UI chrome (Phase 2b) → Wave 2 security/state cores → Wave 3 boundary-refactor
  (browser-tools, tab-engine, Phase 1b/2b). Each extraction is its own branch/PR with its own DoD
  (per-package `typecheck lint test build`, `depcruise` clean, `@tepegoz/desktop` build + e2e smoke).

## Consequences
- Clear, agreed module boundaries; new work targets a package instead of growing `apps/desktop`.
- `dependency-cruiser.cjs` gains concrete layer rules incrementally "as those packages land" (as its
  own comment anticipates), tightening enforcement over time.
- The catalog is a backlog, not a commitment to a date; items are promoted into the relevant phase
  (e.g. UI chrome rides Phase 2b; `browser-tools`/`tab-engine` ride Phase 1b/2b).
- Rejected: **multiple apps** (unnecessary — a single app consuming packages gives the same modularity
  with less surface); **publishing packages to npm** (they stay bundled, ADR-0002); **big-bang refactor**
  (each seam ships independently to keep PRs reviewable and the app always runnable).
