# @tepegoz/i18n CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support English as the source locale.
- [ ] Support Turkish as a first-class locale.
- [ ] Support resolving browser or OS locale tags to supported locales.
- [ ] Support a default locale fallback.
- [ ] Support shared core dictionaries for common, window, and error strings.
- [ ] Support per-package dictionaries owned by feature packages.
- [ ] Support compile-time parity between English and Turkish dictionaries.
- [ ] Support runtime dictionary selection for non-React code.
- [ ] Support React provider for renderer locale context.
- [ ] Support React hooks for reading the active locale.
- [ ] Support React hooks for selecting a package-owned dictionary.
- [ ] Support fallback to English when localized entries are unavailable.
- [ ] Support test helpers for key-path parity checks.
- [ ] Support lintable rules against hardcoded UI strings.
- [ ] Support dictionary typing that rejects absent keys.
- [ ] Support dictionary typing that rejects mismatched nested shapes.
- [ ] Support owner-level string boundaries to avoid global string sprawl.
- [ ] Support main-process localized titles and prompts.
- [ ] Support renderer localized UI copy.
- [ ] Support extension-owned dictionaries.
- [ ] Support pluralization patterns for count-sensitive strings.
- [ ] Support interpolation patterns for user-facing values.
- [ ] Support date, time, and number formatting hooks.
- [ ] Support RTL-ready metadata for future locales.
- [ ] Support pseudo-locale testing for layout stress.
- [ ] Support documentation for adding strings to the correct owner.
- [ ] Support CI checks for dictionary parity.
- [ ] Support typed locale lists for settings and preferences.
- [ ] Support future locale packs without changing core APIs.
- [ ] Support safe formatting that does not inject raw HTML.
