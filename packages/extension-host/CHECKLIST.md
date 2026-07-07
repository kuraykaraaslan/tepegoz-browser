# @tepegoz/extension-host CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support registering capabilities from enabled extensions.
- [ ] Support unregistering capabilities when extensions disable.
- [ ] Support idempotent reconciliation after startup and preference changes.
- [ ] Support host injection for extension state and management actions.
- [ ] Support listing extensions through agent-callable management capabilities.
- [ ] Support reading one extension's details through an agent capability.
- [ ] Support enabling and disabling extensions through policy-aware tools.
- [ ] Support extension capability provenance in registered descriptors.
- [ ] Support separate capability sets per extension.
- [ ] Support duplicate capability detection across extensions.
- [ ] Support graceful handling when an extension host dependency is unavailable.
- [ ] Support in-process extension capabilities with injected host access.
- [ ] Support lifecycle hooks for extension-provided stores or resources.
- [ ] Support action interceptors for popup, tab, and navigation actions.
- [ ] Support synchronous interceptor evaluation for browser-critical paths.
- [ ] Support live enabled-state checks for interceptors.
- [ ] Support deterministic first-match behavior for blocking interceptors.
- [ ] Support audit-friendly reasons for extension-blocked actions.
- [ ] Support safe defaults when extension metadata is malformed.
- [ ] Support always-on host management tools with stable identifiers.
- [ ] Support extension permission display for management surfaces.
- [ ] Support extension version and name metadata for agent context.
- [ ] Support bridge-free operation with app-provided registry adapters.
- [ ] Support test seams for registry, management host, and enabled checks.
- [ ] Support future remote extension processes without changing ToolGateway semantics.
- [ ] Support revocation of capabilities before extension unload.
- [ ] Support policy review before extension state changes.
- [ ] Support recovery from extension capability registration errors.
- [ ] Support metrics for extension reconciliation and tool counts.
- [ ] Support clear docs for wiring a new built-in extension host.
