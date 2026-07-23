# @tepegoz/desktop-ipc CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a preload-safe default entry with no runtime schema dependencies.
- [x] Support a main-process schema entry for runtime validation.
- [x] Support typed channel names grouped by domain and action.
- [x] Support a single shared API shape for the context bridge.
- [x] Support typed preferences shared across main, preload, renderer, and settings.
- [x] Support tab and tab-group wire types.
- [x] Support typed internal-page addresses.
- [x] Support encoded boundary errors with message and status code.
- [x] Support decoding boundary errors in renderer-safe code.
- [x] Support fail-closed public/private classification for settings.
- [x] Support curated read-only settings exposed to extensions.
- [x] Support type-only DTO re-exports from feature packages.
- [x] Support bookmark, history, password, macro, agent, and tab payload contracts.
- [x] Support one validator per untrusted IPC payload.
- [ ] Support safeParse validation at every renderer-to-main boundary.
- [x] Support compile-time drift detection for new preference keys.
- [ ] Support preload bundle safety checks that prevent zod imports in the default entry.
- [x] Support stable IPC contracts for extension and internal page consumers.
- [x] Support structured channel naming for audit and debugging.
- [x] Support graceful propagation of policy-denied actions.
- [x] Support typed event subscriptions from main to renderer.
- [x] Support typed unsubscribe functions for renderer listeners.
- [x] Support explicit schemas for destructive or sensitive actions.
- [x] Support version-friendly DTO evolution with optional fields.
- [ ] Support backwards-compatible internal-page DTOs during migrations.
- [x] Support renderer-safe metadata types that exclude secrets.
- [x] Support strongly typed agent approval and event flows.
- [x] Support shared enums for provider, locale, theme, and tool concepts.
- [ ] Support docs and examples for adding a new IPC channel.
- [ ] Support tests that guard the two-entry package split.
