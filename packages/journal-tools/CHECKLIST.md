# @tepegoz/journal-tools CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support registering journal search as an always-on built-in capability.
- [x] Support injected journal readers without persistence dependencies.
- [x] Support searching recent audit events.
- [ ] Support filtering events by time range.
- [ ] Support filtering events by event type.
- [ ] Support filtering events by tool name.
- [ ] Support filtering events by provider or capability source.
- [ ] Support filtering events by tab, URL, or origin metadata when available.
- [ ] Support pagination for long audit histories.
- [x] Support model-safe event projections.
- [x] Support redacted event summaries.
- [ ] Support stable event identifiers in search results.
- [ ] Support chronological and reverse-chronological ordering.
- [x] Support capped result counts for model context budgets.
- [x] Support policy-aware access through the ToolGateway.
- [ ] Support clear errors when the journal reader is unavailable.
- [x] Support search queries that avoid raw SQL exposure.
- [x] Support audit of journal-search tool calls themselves.
- [ ] Support host-provided retention boundaries.
- [ ] Support extension and agent attribution in returned events.
- [x] Support browsing events related to a given agent run.
- [x] Support surfacing denial and approval history for user debugging.
- [ ] Support safe handling of malformed event projections.
- [ ] Support text search over redacted event messages.
- [ ] Support event-kind facets for UI or agent summarization.
- [x] Support deterministic test fixtures for journal-reader behavior.
- [ ] Support future sync metadata in journal entry projections.
- [x] Support minimal APIs that never expose unredacted blobs.
- [ ] Support structured result envelopes for planner consumption.
- [ ] Support documentation for adding new journal query dimensions.
