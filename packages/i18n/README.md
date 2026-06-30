# @tepegoz/i18n

Localization catalog. **English is the primary/source locale; Turkish is first-class.** Every
user-facing string comes from here — hardcoded UI strings are forbidden (lint, Phase 1a).

## Exports
- `resources` (`Record<Locale, Resources>`), `Resources` (shape contract derived from `en`),
  `SUPPORTED_LOCALES`, `Locale`, `DEFAULT_LOCALE` (`'en'`), `resolveLocale(tag)`.
- The `Resources = typeof en` contract makes any missing/mismatched key in another locale a **build
  error**; an integrity test asserts equal key sets.

## Adding a string
Add it under the right namespace in `src/locales/en.ts`, then add the Turkish value in `tr.ts`
(TypeScript will flag it if you forget).

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
