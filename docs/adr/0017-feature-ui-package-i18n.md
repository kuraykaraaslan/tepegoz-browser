# ADR-0017: Feature-UI packages own their dictionaries

- **Status:** Accepted
- **Date:** 2026-07-01
- **Supersedes:** the "presentational leaves remain string-free" clause of
  [ADR-0016](0016-per-package-i18n.md) for the three feature-UI packages named below.

## Context
[ADR-0016](0016-per-package-i18n.md) moved feature strings next to their owner but kept the extracted
UI packages as **string-free presentational leaves**: `history-ui`, `extensions-ui` and `settings-ui`
took their copy via `labels` props, and the *app* owned the `history`/`extensions`/`settings`
namespaces in `apps/desktop/src/i18n`. In practice this left the app dictionary holding strings that no
app-shell surface renders — each namespace's only real consumer is its `-ui` package (plus the native
menu / tab title in the main process). The distribution therefore still didn't match "strings live with
the feature": editing a history label meant touching the app, not `history-ui`.

We accept the trade-off ADR-0016 rejected (these leaves stop being generic, app-agnostic shells) in
exchange for a dictionary layout where each feature package is the single home of its strings.

## Decision
- **`history-ui`, `extensions-ui`, `settings-ui` each own their dictionary.** Every one declares
  `src/i18n/{en,tr,index}.ts` via `defineDict({ en, tr })` + a co-located parity test (`keyPaths` from
  `@tepegoz/i18n/testing`), mirroring the extension packages. Each exposes a React-free `./i18n` subpath
  export.
- **The components self-localize.** They call `useT(theirDict)` internally and drop the `labels` prop
  (and its `*Labels` interface). The app's thin wrappers (`ExtensionsPage`, `ExtensionTray`,
  `SettingsPage`) import the same dict from the package's `./i18n` subpath for the copy they render.
- **The non-React main process** resolves these via `pick(dict, mainLocale())` by importing the package
  `./i18n` subpaths (`defineDict` pulls no React), so native menus / tab titles keep working without the
  React runtime.
- **The page title reuses shared core.** `settings-ui` does not re-translate `'Settings'`; its heading,
  the settings tab title and the menu entry all read `common.settings` from `@tepegoz/i18n`
  (`coreDict`). The duplicate `browser.settings` / `settings.title` keys are removed.
- **`commandPalette` → `@tepegoz/ext-agent`** (the agentic surface owns it); **`onboarding` is removed**
  (no owner / consumer yet). The app dictionary now holds only `browser` and `sidebar`, both genuinely
  app-owned (the chrome frame + native menus).

## Consequences
- Feature strings live in the feature package; the app dictionary shrinks to true app-shell chrome.
- Parity stays a build error per dict (`typeof en` typing on `tr`) plus a co-located runtime test.
- These three packages gain a `@tepegoz/i18n` dependency and are no longer reusable outside this app —
  the deliberate reversal of ADR-0016's leaf-string-free rule.
- `browser`/`sidebar` remain app-owned: `browser` is shared by the native menu **and** the chrome frame,
  so moving it into a package would force a `browser-chrome → apps` import its leaf rule forbids.
- Rejected: **moving the whole `SettingsPage`/`ExtensionsPage` components into the packages** (larger
  refactor than the i18n cleanup warranted); **keeping the leaves string-free** (the ADR-0016 status quo
  the user explicitly asked to change).
