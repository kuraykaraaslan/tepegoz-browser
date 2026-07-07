# @tepegoz/screenshots CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support public screenshot types for browser visual fallback.
- [ ] Support main-process-only schemas for screenshot capture requests.
- [ ] Support model-safe screenshot metadata wrapping.
- [ ] Support registering browser screenshot tools in the Capability Plane.
- [ ] Support injected desktop capture adapters.
- [ ] Support screenshot capture by active tab.
- [ ] Support screenshot capture by specific tab identifier.
- [ ] Support viewport-only capture metadata.
- [ ] Support full-page capture metadata when the host offers it.
- [ ] Support image size and format metadata.
- [ ] Support redacted screenshot references rather than raw image payloads.
- [ ] Support content-addressed screenshot blob references.
- [ ] Support policy-aware screenshot tool invocation.
- [ ] Support sensitive-site screenshot restrictions.
- [ ] Support human approval metadata for high-risk screenshot capture.
- [ ] Support visual fallback descriptions for agent perception.
- [ ] Support screenshot eviction hints for storage management.
- [ ] Support thumbnail metadata for UI surfaces.
- [ ] Support timestamp and origin metadata.
- [ ] Support capture failure reasons such as tab unavailable, timeout, or policy denial.
- [ ] Support timeout controls for capture operations.
- [ ] Support maximum screenshot size limits.
- [ ] Support image format negotiation such as PNG, JPEG, and WebP.
- [ ] Support accessibility-friendly screenshot summaries when supplied by the host.
- [ ] Support audit summaries without embedding image bytes.
- [ ] Support private-session screenshot persistence rules.
- [ ] Support deterministic schemas for tests.
- [ ] Support future vision-model integrations through stable metadata.
- [ ] Support bridge-free domain logic without Electron imports.
- [ ] Support documentation for host capture adapter responsibilities.
