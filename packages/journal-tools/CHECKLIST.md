# @tepegoz/journal-tools CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support registering journal search as an always-on built-in capability.
- [ ] Support injected journal readers without persistence dependencies.
- [ ] Support searching recent audit events.
- [ ] Support filtering events by time range.
- [ ] Support filtering events by event type.
- [ ] Support filtering events by tool name.
- [ ] Support filtering events by provider or capability source.
- [ ] Support filtering events by tab, URL, or origin metadata when available.
- [ ] Support pagination for long audit histories.
- [ ] Support model-safe event projections.
- [ ] Support redacted event summaries.
- [ ] Support stable event identifiers in search results.
- [ ] Support chronological and reverse-chronological ordering.
- [ ] Support capped result counts for model context budgets.
- [ ] Support policy-aware access through the ToolGateway.
- [ ] Support clear errors when the journal reader is unavailable.
- [ ] Support search queries that avoid raw SQL exposure.
- [ ] Support audit of journal-search tool calls themselves.
- [ ] Support host-provided retention boundaries.
- [ ] Support extension and agent attribution in returned events.
- [ ] Support browsing events related to a given agent run.
- [ ] Support surfacing denial and approval history for user debugging.
- [ ] Support safe handling of malformed event projections.
- [ ] Support text search over redacted event messages.
- [ ] Support event-kind facets for UI or agent summarization.
- [ ] Support deterministic test fixtures for journal-reader behavior.
- [ ] Support future sync metadata in journal entry projections.
- [ ] Support minimal APIs that never expose unredacted blobs.
- [ ] Support structured result envelopes for planner consumption.
- [ ] Support documentation for adding new journal query dimensions.
