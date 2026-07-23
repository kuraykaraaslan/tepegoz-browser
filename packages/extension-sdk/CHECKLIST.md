# @tepegoz/extension-sdk CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support declarative extension manifests with stable reverse-DNS identifiers.
- [x] Support manifest validation for trusted and untrusted extension sources.
- [x] Support developer-friendly throwing validation helpers.
- [x] Support non-throwing validation helpers for runtime catalog loading.
- [ ] Support versioned manifest contracts.
- [x] Support extension name, description, version, and icon metadata.
- [x] Support declared surfaces such as popup, modal, panel, sidebar, and page.
- [x] Support toolbar actions mapped to declared surfaces.
- [x] Support click and double-click action bindings.
- [x] Support cross-validation between actions and available surfaces.
- [x] Support per-locale labels for user-facing extension text.
- [x] Support a closed permission enum with no free-form permission strings.
- [x] Support MCP server declarations contributed by extensions.
- [x] Support transport metadata for stdio and future network MCP servers.
- [x] Support in-process agent-callable capability definitions.
- [x] Support capability input validation through typed schemas.
- [x] Support capability handlers with injected host access.
- [x] Support normalized tool descriptors for the capability registry.
- [x] Support duplicate capability-id rejection within an extension.
- [x] Support provenance stamping for each extension capability.
- [x] Support typed author-facing capability definitions.
- [x] Support typed registry-facing normalized capabilities.
- [x] Support action interceptor definitions for browser mechanics.
- [x] Support synchronous allow and deny predicates for critical browser actions.
- [x] Support typed action contexts for tab, popup, and navigation actions.
- [x] Support per-extension interceptor sets.
- [x] Support compile-time types for manifest, surface, capability, and interceptor shapes.
- [x] Support clear errors for invalid extension IDs.
- [ ] Support future manifest fields through explicit schema evolution.
- [ ] Support documentation examples for extension authors.
