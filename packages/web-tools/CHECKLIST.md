# @tepegoz/web-tools CHECKLIST

Prepared from package metadata only because this package has no README; implementation status was not inspected.

- [ ] Support web-domain capability descriptors for agent use.
- [ ] Support zod schemas for web tool inputs.
- [ ] Support registering web tools in the Capability Plane.
- [ ] Support shared type usage for tool descriptors and errors.
- [ ] Support fetching web resources through host-approved transports.
- [ ] Support reading public web page metadata.
- [ ] Support extracting page titles and descriptions.
- [ ] Support validating URLs before web operations.
- [ ] Support safe handling of redirects.
- [ ] Support timeout metadata for network-bound web actions.
- [ ] Support cancellation metadata for long web actions.
- [ ] Support HTTP status reporting in tool results.
- [ ] Support content-type reporting in tool results.
- [ ] Support size limits for fetched content.
- [ ] Support robots, policy, or user-preference gates supplied by the host.
- [ ] Support redacting secrets from fetched or submitted web data.
- [ ] Support taint marking for web-derived content.
- [ ] Support model-safe summaries of fetched web content.
- [ ] Support structured errors for network, validation, and policy failures.
- [ ] Support idempotency metadata for web read versus write actions.
- [ ] Support read-only browsing helpers distinct from browser-tab tools.
- [ ] Support form-submission descriptors when host policy allows them.
- [ ] Support link-discovery helpers for pages and feeds.
- [ ] Support sitemap or feed parsing helpers when the host supplies content.
- [ ] Support per-origin rate limiting metadata.
- [ ] Support audit provenance for every web tool call.
- [ ] Support tests for schemas and capability registration.
- [ ] Support future web transports without changing tool names.
- [ ] Support documentation for each exported web tool entry.
- [ ] Support strict separation between web tools and unrestricted network access.
