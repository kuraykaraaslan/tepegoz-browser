# @tepegoz/clipboard CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support classifying clipboard read operations by risk level.
- [ ] Support classifying clipboard write operations by risk level.
- [ ] Support approval defaults for copy, cut, paste, and clipboard inspection.
- [ ] Support metadata that describes clipboard operations without storing contents.
- [ ] Support keeping clipboard contents out of persistent state.
- [ ] Support keeping clipboard contents out of logs.
- [ ] Support keeping clipboard contents out of event journal payloads.
- [ ] Support redacted audit summaries for clipboard access.
- [ ] Support separate policy for reading user clipboard data and writing generated data.
- [ ] Support taint metadata for clipboard content derived from web pages.
- [ ] Support host-provided clipboard adapters for platform-specific access.
- [ ] Support MIME-type metadata for text, HTML, images, and files.
- [ ] Support safe handling of large clipboard payload descriptions.
- [ ] Support paste-target metadata such as origin, field type, and editability.
- [ ] Support human confirmation for high-risk clipboard writes.
- [ ] Support human confirmation for clipboard reads on sensitive sites.
- [ ] Support deny-by-default behavior for unknown clipboard operation types.
- [ ] Support user-facing reason strings for blocked clipboard actions.
- [ ] Support incognito or private-session clipboard restrictions.
- [ ] Support permission persistence choices such as once, session, and always.
- [ ] Support clearing transient clipboard metadata after an operation.
- [ ] Support automated tests over policy metadata without OS clipboard access.
- [ ] Support platform-neutral operation descriptors.
- [ ] Support extension and agent clipboard calls through shared policy semantics.
- [ ] Support detecting password-like or secret-like clipboard categories by metadata.
- [ ] Support safe serialization of clipboard event summaries.
- [ ] Support future binary clipboard formats without changing core policy shape.
- [ ] Support accessibility-friendly descriptions of clipboard prompts.
- [ ] Support localized operation labels supplied by callers.
- [ ] Support minimal APIs that never expose raw clipboard contents by default.
