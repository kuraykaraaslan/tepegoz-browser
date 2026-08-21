# @tepegoz/i18n

The i18n **core + runtime**. **English is the primary/source locale; Turkish is first-class.** Hardcoded
UI strings are forbidden (lint, Phase 1a).

Feature strings are **owned per package/extension** (each ships its own `src/i18n/` dictionary); this
package holds only the **shared cross-cutting core** (`common`, `window`, `errors`) plus the machinery
every owner uses. See [ADR-0016](../../docs/adr/0016-per-package-i18n.md).

## Exports

### `@tepegoz/i18n` (framework-agnostic — safe for main/backend)

- `resources` (`Record<Locale, Resources>`) and `coreDict` — the shared core (`common`/`window`/`errors`).
  `Resources = typeof en` makes any missing/mismatched core key a **build error**; a parity test asserts
  equal key sets.
- `SUPPORTED_LOCALES`, `Locale`, `DEFAULT_LOCALE` (`'en'`), `resolveLocale(tag)`.
- `defineDict({ en, tr })` — declare an owner's own dictionary; typing `tr` as `typeof en` makes a missing
  Turkish key a **build error** per dict. `pick(dict, locale)` — the non-React accessor (used by the main
  process). `type Dict<T>`.

### `@tepegoz/i18n/react` (React runtime — renderer/UI packages/extensions)

- `I18nProvider({ locale, children })` — mount once near the root (both `App` and `PopupApp`).
- `useLocale()` and `useT(dict)` — self-localize a component from its own dict (with `en` fallback).

### `@tepegoz/i18n/testing`

- `keyPaths(obj)` — the helper each owner's parity test uses.

## Adding a string

Add it to the **owner** package's `src/i18n/en.ts` **and** `tr.ts` (the compiler + that package's parity
test enforce en/tr parity). Only genuinely cross-cutting strings (`common`/`window`/`errors`) go here.
Consume it with `useT(ownerDict)` in React, or `pick(ownerDict, locale)` in the main process.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
