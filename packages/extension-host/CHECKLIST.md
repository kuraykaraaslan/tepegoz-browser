# @tepegoz/extension-host CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support registering capabilities from enabled extensions.
- [x] Support unregistering capabilities when extensions disable.
- [x] Support idempotent reconciliation after startup and preference changes.
- [x] Support host injection for extension state and management actions.
- [x] Support listing extensions through agent-callable management capabilities.
- [x] Support reading one extension's details through an agent capability.
- [x] Support enabling and disabling extensions through policy-aware tools.
- [x] Support extension capability provenance in registered descriptors.
- [x] Support separate capability sets per extension.
- [x] Support duplicate capability detection across extensions.
- [ ] Support graceful handling when an extension host dependency is unavailable.
- [x] Support in-process extension capabilities with injected host access.
- [ ] Support lifecycle hooks for extension-provided stores or resources.
- [x] Support action interceptors for popup, tab, and navigation actions.
- [x] Support synchronous interceptor evaluation for browser-critical paths.
- [x] Support live enabled-state checks for interceptors.
- [x] Support deterministic first-match behavior for blocking interceptors.
- [ ] Support audit-friendly reasons for extension-blocked actions.
- [x] Support safe defaults when extension metadata is malformed.
- [x] Support always-on host management tools with stable identifiers.
- [x] Support extension permission display for management surfaces.
- [x] Support extension version and name metadata for agent context.
- [x] Support bridge-free operation with app-provided registry adapters.
- [x] Support test seams for registry, management host, and enabled checks.
- [ ] Support future remote extension processes without changing ToolGateway semantics.
- [ ] Support revocation of capabilities before extension unload.
- [x] Support policy review before extension state changes.
- [ ] Support recovery from extension capability registration errors.
- [ ] Support metrics for extension reconciliation and tool counts.
- [ ] Support clear docs for wiring a new built-in extension host.
