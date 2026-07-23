# @tepegoz/uploads CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support redacted upload records.
- [x] Support upload status helpers.
- [x] Support upload risk helpers.
- [x] Support zod schemas for upload-domain payloads.
- [x] Support registering upload capabilities in the Capability Plane.
- [x] Support host-owned local file paths.
- [x] Support host-owned CDP file-input binding.
- [ ] Support host-owned native file dialogs.
- [x] Support Event Journal audit metadata for uploads.
- [x] Support source page URL and origin metadata.
- [x] Support target form or input metadata.
- [x] Support file display names without exposing full paths.
- [x] Support file size and MIME type metadata.
- [x] Support multi-file upload records.
- [ ] Support user approval metadata for risky uploads.
- [x] Support sensitive-site upload restrictions.
- [x] Support egress-risk classification for uploaded files.
- [ ] Support upload queued, pending approval, completed, failed, and canceled statuses.
- [x] Support cancellation metadata for pending uploads.
- [ ] Support retry metadata for failed uploads.
- [ ] Support private-session persistence rules.
- [ ] Support agent-initiated and user-initiated upload attribution.
- [ ] Support redacted artifacts for model-safe summaries.
- [x] Support reducer state for upload activity.
- [ ] Support selectors for recent and risky uploads.
- [ ] Support clear failure reasons such as policy, file unavailable, and browser binding errors.
- [x] Support tests for schemas, status helpers, and risk helpers.
- [ ] Support future cloud file picker integrations.
- [x] Support platform-neutral upload command descriptors.
- [x] Support documentation for desktop host responsibilities.
