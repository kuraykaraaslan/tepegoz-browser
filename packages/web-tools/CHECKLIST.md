# @tepegoz/web-tools CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support web-domain capability descriptors for agent use.
- [x] Support zod schemas for web tool inputs.
- [x] Support registering web tools in the Capability Plane.
- [x] Support shared type usage for tool descriptors and errors.
- [x] Support fetching web resources through host-approved transports.
- [x] Support reading public web page metadata.
- [ ] Support extracting page titles and descriptions.
- [x] Support validating URLs before web operations.
- [ ] Support safe handling of redirects.
- [x] Support timeout metadata for network-bound web actions.
- [ ] Support cancellation metadata for long web actions.
- [x] Support HTTP status reporting in tool results.
- [x] Support content-type reporting in tool results.
- [x] Support size limits for fetched content.
- [x] Support robots, policy, or user-preference gates supplied by the host.
- [ ] Support redacting secrets from fetched or submitted web data.
- [ ] Support taint marking for web-derived content.
- [ ] Support model-safe summaries of fetched web content.
- [x] Support structured errors for network, validation, and policy failures.
- [ ] Support idempotency metadata for web read versus write actions.
- [x] Support read-only browsing helpers distinct from browser-tab tools.
- [ ] Support form-submission descriptors when host policy allows them.
- [ ] Support link-discovery helpers for pages and feeds.
- [x] Support sitemap or feed parsing helpers when the host supplies content.
- [ ] Support per-origin rate limiting metadata.
- [x] Support audit provenance for every web tool call.
- [x] Support tests for schemas and capability registration.
- [x] Support future web transports without changing tool names.
- [ ] Support documentation for each exported web tool entry.
- [ ] Support strict separation between web tools and unrestricted network access.
