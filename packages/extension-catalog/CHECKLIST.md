# @tepegoz/extension-catalog CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a versioned catalog file envelope.
- [ ] Support validating catalog entries at the trust boundary.
- [ ] Support retaining valid entries when some catalog entries are malformed.
- [ ] Support human-readable validation errors for catalog authors.
- [ ] Support first-party and built-in extension metadata.
- [ ] Support catalog-driven extension additions without code changes.
- [ ] Support catalog-driven extension retirement.
- [ ] Support catalog-driven extension ordering and grouping.
- [ ] Support per-extension manifest validation through the extension SDK schema.
- [ ] Support icon metadata for extension discovery surfaces.
- [ ] Support localized catalog labels and descriptions.
- [ ] Support compatibility metadata for app versions.
- [ ] Support feature flags or rollout metadata for catalog entries.
- [ ] Support recommended or featured extension markers.
- [ ] Support category metadata such as productivity, privacy, and developer tools.
- [ ] Support permission summaries for catalog cards.
- [ ] Support source metadata for bundled, local, and remote extensions.
- [ ] Support integrity metadata for packaged extension assets.
- [ ] Support update-channel metadata such as stable, beta, and experimental.
- [ ] Support dependency metadata between extensions when needed.
- [ ] Support conflict metadata for mutually exclusive extensions.
- [ ] Support catalog schema migrations across versions.
- [ ] Support deterministic sorting for stable UI output.
- [ ] Support duplicate extension-id detection.
- [ ] Support unknown-field tolerance for forward compatibility where safe.
- [ ] Support strict required fields for identity and version metadata.
- [ ] Support offline catalog loading from bundled data.
- [ ] Support external catalog loading through host-owned I/O.
- [ ] Support tests for malformed, duplicate, and partially valid catalogs.
- [ ] Support documentation for adding a new catalog entry.
