# ADR-0016: Per-package i18n dictionaries + a React i18n runtime

- **Status:** Accepted (partially superseded)
- **Date:** 2026-07-01
- **Superseded by:** [ADR-0017](0017-feature-ui-package-i18n.md) — the "presentational leaves remain
  string-free" clause no longer holds for `history-ui`/`extensions-ui`/`settings-ui`, which now own their
  own dictionaries. The rest of this ADR (shared core, React runtime, `pick` for non-React, app-owned
  `browser`) still stands.

## Context
`@tepegoz/i18n` began as a **monolithic catalog**: one `en`/`tr` object with every namespace
(`browser`, `agentConsole`, `settings`, `userAgent`, …). Every consumer imported the whole `Resources`
tree — the renderer did `const t = resources[locale]` and prop-drilled `t` into components/extensions,
and the main process read it via `mainResources()`. As the app was carved into packages
([ADR-0015](0015-package-extraction-roadmap.md)), a package's strings still lived far away in the central
catalog, so extracting a feature meant editing two packages and threading `t`/`labels` through props.

We want each **package/extension to own its own dictionary** so feature strings live next to the feature,
while keeping the en/tr parity guarantee (a build error today) and not coupling the string-free
presentational leaves or the non-React main process to React.

## Decision
- **Shared core stays central.** `@tepegoz/i18n` keeps only the cross-cutting namespaces
  `common`, `window`, `errors` (as `resources`/`Resources` + `coreDict`). Everything else moves out.
- **Each owner ships its own dictionary.** A package/extension declares its feature strings in
  `src/i18n/{en,tr,index}.ts` via `defineDict({ en, tr })` and a per-package parity test (`keyPaths` from
  `@tepegoz/i18n/testing`). Typing `tr` as `typeof en` keeps a missing Turkish key a **build error**, now
  per dict. Owners: `agentConsole → @tepegoz/ext-agent`, `userAgent → @tepegoz/ext-user-agent`, and the
  app-shell namespaces (`browser`, `sidebar`, `settings`, `extensions`, `history`, `commandPalette`,
  `onboarding`) → `apps/desktop/src/i18n` (app-owned, spanning renderer + main).
- **Self-localizing React runtime.** `@tepegoz/i18n/react` provides `I18nProvider` (holds the active
  `Locale`) + `useT(dict)`/`useLocale()`. Components/extensions call `useT(theirDict)` instead of
  receiving a `t` prop; the extension surface contract drops `t`. Both `App` and `PopupApp` mount a
  provider. React is an **optional peer** behind the `./react` subpath, so the main process/backend
  (importing only `@tepegoz/i18n`) stay React-free.
- **Non-React consumers use `pick`.** The main process resolves each app dict for its locale with
  `pick(dict, mainLocale())` (`lib/i18n-main.ts` → `mainStrings()`); native menus/tab-titles read those.
  App code that sits above its own provider (e.g. `App` composing the chrome labels) also uses `pick`.
- **Presentational leaves remain string-free.** `tab-strip`, `window-controls`, `history-ui`,
  `extensions-ui`, and `browser-chrome` keep taking `labels` via props and gain no i18n dependency;
  `browser-chrome` narrows its prop from `Resources` to a local `BrowserChromeStrings`
  (`common`/`window`/`browser`) the app composes from `useT(coreDict)` + its own `browserDict`.

## Consequences
- Feature strings live with the feature; extracting/owning a surface no longer means editing the central
  catalog. Parity is enforced per dict at build time + a co-located runtime test.
- The `browser` namespace is genuinely shared (native menus **and** the chrome); it stays **app-owned** as
  one `browserDict` used by both renderer and main, avoiding a `browser-chrome → apps` import (which its
  leaf rule forbids) and key duplication.
- A component rendered outside an `<I18nProvider>` silently falls back to `DEFAULT_LOCALE`; both render
  roots are wrapped to prevent this.
- Supersedes the "keep catalog keys in `@tepegoz/i18n`" guidance in
  [ADR-0015](0015-package-extraction-roadmap.md) / `docs/package-map.md` (both updated).
- Rejected: **prop-injection everywhere** (keeps the central catalog as the source of truth — the thing we
  wanted to remove); **fully self-contained packages** (each re-translating `common`/`window` — needless
  duplication of OK/Cancel/Close); **React on the root export** (would pull React into the main bundle).
