# @tepegoz/screenshots CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support public screenshot types for browser visual fallback.
- [x] Support main-process-only schemas for screenshot capture requests.
- [x] Support model-safe screenshot metadata wrapping.
- [x] Support registering browser screenshot tools in the Capability Plane.
- [x] Support injected desktop capture adapters.
- [x] Support screenshot capture by active tab.
- [x] Support screenshot capture by specific tab identifier.
- [x] Support viewport-only capture metadata.
- [x] Support full-page capture metadata when the host offers it.
- [x] Support image size and format metadata.
- [ ] Support redacted screenshot references rather than raw image payloads.
- [ ] Support content-addressed screenshot blob references.
- [x] Support policy-aware screenshot tool invocation.
- [x] Support sensitive-site screenshot restrictions.
- [ ] Support human approval metadata for high-risk screenshot capture.
- [x] Support visual fallback descriptions for agent perception.
- [ ] Support screenshot eviction hints for storage management.
- [ ] Support thumbnail metadata for UI surfaces.
- [x] Support timestamp and origin metadata.
- [ ] Support capture failure reasons such as tab unavailable, timeout, or policy denial.
- [ ] Support timeout controls for capture operations.
- [x] Support maximum screenshot size limits.
- [ ] Support image format negotiation such as PNG, JPEG, and WebP.
- [ ] Support accessibility-friendly screenshot summaries when supplied by the host.
- [x] Support audit summaries without embedding image bytes.
- [ ] Support private-session screenshot persistence rules.
- [x] Support deterministic schemas for tests.
- [ ] Support future vision-model integrations through stable metadata.
- [x] Support bridge-free domain logic without Electron imports.
- [ ] Support documentation for host capture adapter responsibilities.
