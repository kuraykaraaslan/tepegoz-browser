# @tepegoz/browser-tools CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support agent-readable page snapshots with URL, title, and sanitized text.
- [ ] Support element snapshots for actionable controls on a page.
- [ ] Support browser navigation by URL in the active tab.
- [ ] Support browser navigation scoped to a specific tab identifier.
- [ ] Support waiting for page load after navigation or actions.
- [ ] Support post-action page validation for lightweight verification.
- [ ] Support clicking elements by stable snapshot reference.
- [ ] Support filling editable elements by stable snapshot reference.
- [ ] Support pressing keyboard keys through the browser host.
- [ ] Support scrolling pages by direction and amount.
- [ ] Support ref invalidation after each new element snapshot.
- [ ] Support sanitized element labels before model exposure.
- [ ] Support capped element lists to fit model context budgets.
- [ ] Support DOM-first perception with room for visual fallback.
- [ ] Support injected browser operations without Electron dependencies.
- [ ] Support registering browser-domain tools as always-on capabilities.
- [ ] Support tool descriptors that identify browser danger classes.
- [ ] Support browser tool calls only through the ToolGateway policy path.
- [ ] Support clear error envelopes for unavailable tabs or stale element refs.
- [ ] Support safe handling of untrusted page text.
- [ ] Support accessible-role awareness for interactable elements.
- [ ] Support hidden or offscreen element filtering for action targeting.
- [ ] Support multi-frame page snapshot metadata when hosts provide it.
- [ ] Support file upload and download handoff signals through host extensions.
- [ ] Support timeout controls for load waits and interaction waits.
- [ ] Support audit-friendly action summaries for each browser operation.
- [ ] Support test fixtures for page and element snapshot builders.
- [ ] Support host-provided screenshots as a perception supplement.
- [ ] Support tab-scoped browser validation after agent actions.
- [ ] Support future browser actions without changing agent runtime flow.
