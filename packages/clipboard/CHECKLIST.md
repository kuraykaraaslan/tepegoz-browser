# @tepegoz/clipboard CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support classifying clipboard read operations by risk level.
- [x] Support classifying clipboard write operations by risk level.
- [x] Support approval defaults for copy, cut, paste, and clipboard inspection.
- [x] Support metadata that describes clipboard operations without storing contents.
- [x] Support keeping clipboard contents out of persistent state.
- [x] Support keeping clipboard contents out of logs.
- [x] Support keeping clipboard contents out of event journal payloads.
- [x] Support redacted audit summaries for clipboard access.
- [x] Support separate policy for reading user clipboard data and writing generated data.
- [ ] Support taint metadata for clipboard content derived from web pages.
- [x] Support host-provided clipboard adapters for platform-specific access.
- [ ] Support MIME-type metadata for text, HTML, images, and files.
- [x] Support safe handling of large clipboard payload descriptions.
- [ ] Support paste-target metadata such as origin, field type, and editability.
- [x] Support human confirmation for high-risk clipboard writes.
- [ ] Support human confirmation for clipboard reads on sensitive sites.
- [x] Support deny-by-default behavior for unknown clipboard operation types.
- [ ] Support user-facing reason strings for blocked clipboard actions.
- [ ] Support incognito or private-session clipboard restrictions.
- [ ] Support permission persistence choices such as once, session, and always.
- [ ] Support clearing transient clipboard metadata after an operation.
- [x] Support automated tests over policy metadata without OS clipboard access.
- [x] Support platform-neutral operation descriptors.
- [ ] Support extension and agent clipboard calls through shared policy semantics.
- [ ] Support detecting password-like or secret-like clipboard categories by metadata.
- [x] Support safe serialization of clipboard event summaries.
- [ ] Support future binary clipboard formats without changing core policy shape.
- [x] Support accessibility-friendly descriptions of clipboard prompts.
- [x] Support localized operation labels supplied by callers.
- [ ] Support minimal APIs that never expose raw clipboard contents by default.
