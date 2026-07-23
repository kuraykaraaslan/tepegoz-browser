# @tepegoz/browser-tools CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support agent-readable page snapshots with URL, title, and sanitized text.
- [x] Support element snapshots for actionable controls on a page.
- [x] Support browser navigation by URL in the active tab.
- [x] Support browser navigation scoped to a specific tab identifier.
- [x] Support waiting for page load after navigation or actions.
- [x] Support post-action page validation for lightweight verification.
- [x] Support clicking elements by stable snapshot reference.
- [x] Support filling editable elements by stable snapshot reference.
- [x] Support pressing keyboard keys through the browser host.
- [x] Support scrolling pages by direction and amount.
- [x] Support ref invalidation after each new element snapshot.
- [x] Support sanitized element labels before model exposure.
- [x] Support capped element lists to fit model context budgets.
- [x] Support DOM-first perception with room for visual fallback.
- [x] Support injected browser operations without Electron dependencies.
- [x] Support registering browser-domain tools as always-on capabilities.
- [x] Support tool descriptors that identify browser danger classes.
- [x] Support browser tool calls only through the ToolGateway policy path.
- [x] Support clear error envelopes for unavailable tabs or stale element refs.
- [x] Support safe handling of untrusted page text.
- [x] Support accessible-role awareness for interactable elements.
- [x] Support hidden or offscreen element filtering for action targeting.
- [ ] Support multi-frame page snapshot metadata when hosts provide it.
- [x] Support file upload and download handoff signals through host extensions.
- [x] Support timeout controls for load waits and interaction waits.
- [x] Support audit-friendly action summaries for each browser operation.
- [x] Support test fixtures for page and element snapshot builders.
- [x] Support host-provided screenshots as a perception supplement.
- [x] Support tab-scoped browser validation after agent actions.
- [ ] Support future browser actions without changing agent runtime flow.
