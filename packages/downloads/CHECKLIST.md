# @tepegoz/downloads CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support preload-safe public types for browser downloads.
- [ ] Support reducer state for active, completed, failed, and canceled downloads.
- [ ] Support selectors for newest downloads and in-progress counts.
- [ ] Support risk classification for downloaded files.
- [ ] Support trust metadata for source URL, final URL, MIME type, and filename.
- [ ] Support redacted download records that avoid unsafe local path exposure.
- [ ] Support paused and resumable download states.
- [ ] Support progress metadata with bytes received and total bytes.
- [ ] Support download speed and estimated time remaining metadata.
- [ ] Support cancellation command descriptors.
- [ ] Support retry command descriptors for failed downloads.
- [ ] Support reveal-in-folder command descriptors without owning filesystem access.
- [ ] Support open-file command descriptors gated by host policy.
- [ ] Support quarantine or safe-browsing status metadata.
- [ ] Support dangerous-file confirmation metadata.
- [ ] Support duplicate filename resolution metadata.
- [ ] Support download grouping by date.
- [ ] Support filtering by status, risk, file type, and source host.
- [ ] Support search over filename and source URL.
- [ ] Support cleanup metadata for clearing completed downloads.
- [ ] Support event records suitable for audit without sensitive file contents.
- [ ] Support private-session rules for download persistence.
- [ ] Support extension and agent initiated download attribution.
- [ ] Support interruption reasons such as network, disk, permission, and policy errors.
- [ ] Support host-owned filesystem paths while exposing safe display names.
- [ ] Support trust-boundary schemas for incoming download events.
- [ ] Support model-safe summaries of download activity.
- [ ] Support future download scanning integrations.
- [ ] Support platform-neutral command and record shapes.
- [ ] Support tests for reducer transitions and risk helpers.
