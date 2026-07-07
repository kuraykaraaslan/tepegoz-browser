# @tepegoz/extension-sdk CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support declarative extension manifests with stable reverse-DNS identifiers.
- [ ] Support manifest validation for trusted and untrusted extension sources.
- [ ] Support developer-friendly throwing validation helpers.
- [ ] Support non-throwing validation helpers for runtime catalog loading.
- [ ] Support versioned manifest contracts.
- [ ] Support extension name, description, version, and icon metadata.
- [ ] Support declared surfaces such as popup, modal, panel, sidebar, and page.
- [ ] Support toolbar actions mapped to declared surfaces.
- [ ] Support click and double-click action bindings.
- [ ] Support cross-validation between actions and available surfaces.
- [ ] Support per-locale labels for user-facing extension text.
- [ ] Support a closed permission enum with no free-form permission strings.
- [ ] Support MCP server declarations contributed by extensions.
- [ ] Support transport metadata for stdio and future network MCP servers.
- [ ] Support in-process agent-callable capability definitions.
- [ ] Support capability input validation through typed schemas.
- [ ] Support capability handlers with injected host access.
- [ ] Support normalized tool descriptors for the capability registry.
- [ ] Support duplicate capability-id rejection within an extension.
- [ ] Support provenance stamping for each extension capability.
- [ ] Support typed author-facing capability definitions.
- [ ] Support typed registry-facing normalized capabilities.
- [ ] Support action interceptor definitions for browser mechanics.
- [ ] Support synchronous allow and deny predicates for critical browser actions.
- [ ] Support typed action contexts for tab, popup, and navigation actions.
- [ ] Support per-extension interceptor sets.
- [ ] Support compile-time types for manifest, surface, capability, and interceptor shapes.
- [ ] Support clear errors for invalid extension IDs.
- [ ] Support future manifest fields through explicit schema evolution.
- [ ] Support documentation examples for extension authors.
