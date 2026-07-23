# @tepegoz/i18n CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support English as the source locale.
- [x] Support Turkish as a first-class locale.
- [x] Support resolving browser or OS locale tags to supported locales.
- [x] Support a default locale fallback.
- [x] Support shared core dictionaries for common, window, and error strings.
- [x] Support per-package dictionaries owned by feature packages.
- [x] Support compile-time parity between English and Turkish dictionaries.
- [x] Support runtime dictionary selection for non-React code.
- [x] Support React provider for renderer locale context.
- [x] Support React hooks for reading the active locale.
- [x] Support React hooks for selecting a package-owned dictionary.
- [x] Support fallback to English when localized entries are unavailable.
- [x] Support test helpers for key-path parity checks.
- [x] Support lintable rules against hardcoded UI strings.
- [x] Support dictionary typing that rejects absent keys.
- [x] Support dictionary typing that rejects mismatched nested shapes.
- [x] Support owner-level string boundaries to avoid global string sprawl.
- [x] Support main-process localized titles and prompts.
- [x] Support renderer localized UI copy.
- [x] Support extension-owned dictionaries.
- [x] Support pluralization patterns for count-sensitive strings.
- [ ] Support interpolation patterns for user-facing values.
- [x] Support date, time, and number formatting hooks.
- [x] Support RTL-ready metadata for future locales.
- [ ] Support pseudo-locale testing for layout stress.
- [x] Support documentation for adding strings to the correct owner.
- [x] Support CI checks for dictionary parity.
- [x] Support typed locale lists for settings and preferences.
- [ ] Support future locale packs without changing core APIs.
- [ ] Support safe formatting that does not inject raw HTML.
