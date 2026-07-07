# @tepegoz/desktop-ipc CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a preload-safe default entry with no runtime schema dependencies.
- [ ] Support a main-process schema entry for runtime validation.
- [ ] Support typed channel names grouped by domain and action.
- [ ] Support a single shared API shape for the context bridge.
- [ ] Support typed preferences shared across main, preload, renderer, and settings.
- [ ] Support tab and tab-group wire types.
- [ ] Support typed internal-page addresses.
- [ ] Support encoded boundary errors with message and status code.
- [ ] Support decoding boundary errors in renderer-safe code.
- [ ] Support fail-closed public/private classification for settings.
- [ ] Support curated read-only settings exposed to extensions.
- [ ] Support type-only DTO re-exports from feature packages.
- [ ] Support bookmark, history, password, macro, agent, and tab payload contracts.
- [ ] Support one validator per untrusted IPC payload.
- [ ] Support safeParse validation at every renderer-to-main boundary.
- [ ] Support compile-time drift detection for new preference keys.
- [ ] Support preload bundle safety checks that prevent zod imports in the default entry.
- [ ] Support stable IPC contracts for extension and internal page consumers.
- [ ] Support structured channel naming for audit and debugging.
- [ ] Support graceful propagation of policy-denied actions.
- [ ] Support typed event subscriptions from main to renderer.
- [ ] Support typed unsubscribe functions for renderer listeners.
- [ ] Support explicit schemas for destructive or sensitive actions.
- [ ] Support version-friendly DTO evolution with optional fields.
- [ ] Support backwards-compatible internal-page DTOs during migrations.
- [ ] Support renderer-safe metadata types that exclude secrets.
- [ ] Support strongly typed agent approval and event flows.
- [ ] Support shared enums for provider, locale, theme, and tool concepts.
- [ ] Support docs and examples for adding a new IPC channel.
- [ ] Support tests that guard the two-entry package split.
