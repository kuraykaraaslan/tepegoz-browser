# @tepegoz/uploads CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support redacted upload records.
- [ ] Support upload status helpers.
- [ ] Support upload risk helpers.
- [ ] Support zod schemas for upload-domain payloads.
- [ ] Support registering upload capabilities in the Capability Plane.
- [ ] Support host-owned local file paths.
- [ ] Support host-owned CDP file-input binding.
- [ ] Support host-owned native file dialogs.
- [ ] Support Event Journal audit metadata for uploads.
- [ ] Support source page URL and origin metadata.
- [ ] Support target form or input metadata.
- [ ] Support file display names without exposing full paths.
- [ ] Support file size and MIME type metadata.
- [ ] Support multi-file upload records.
- [ ] Support user approval metadata for risky uploads.
- [ ] Support sensitive-site upload restrictions.
- [ ] Support egress-risk classification for uploaded files.
- [ ] Support upload queued, pending approval, completed, failed, and canceled statuses.
- [ ] Support cancellation metadata for pending uploads.
- [ ] Support retry metadata for failed uploads.
- [ ] Support private-session persistence rules.
- [ ] Support agent-initiated and user-initiated upload attribution.
- [ ] Support redacted artifacts for model-safe summaries.
- [ ] Support reducer state for upload activity.
- [ ] Support selectors for recent and risky uploads.
- [ ] Support clear failure reasons such as policy, file unavailable, and browser binding errors.
- [ ] Support tests for schemas, status helpers, and risk helpers.
- [ ] Support future cloud file picker integrations.
- [ ] Support platform-neutral upload command descriptors.
- [ ] Support documentation for desktop host responsibilities.
