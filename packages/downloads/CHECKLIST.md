# @tepegoz/downloads CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support preload-safe public types for browser downloads.
- [x] Support reducer state for active, completed, failed, and canceled downloads.
- [x] Support selectors for newest downloads and in-progress counts.
- [x] Support risk classification for downloaded files.
- [x] Support trust metadata for source URL, final URL, MIME type, and filename.
- [x] Support redacted download records that avoid unsafe local path exposure.
- [x] Support paused and resumable download states.
- [x] Support progress metadata with bytes received and total bytes.
- [ ] Support download speed and estimated time remaining metadata.
- [x] Support cancellation command descriptors.
- [ ] Support retry command descriptors for failed downloads.
- [x] Support reveal-in-folder command descriptors without owning filesystem access.
- [x] Support open-file command descriptors gated by host policy.
- [x] Support quarantine or safe-browsing status metadata.
- [x] Support dangerous-file confirmation metadata.
- [x] Support duplicate filename resolution metadata.
- [ ] Support download grouping by date.
- [ ] Support filtering by status, risk, file type, and source host.
- [ ] Support search over filename and source URL.
- [x] Support cleanup metadata for clearing completed downloads.
- [x] Support event records suitable for audit without sensitive file contents.
- [ ] Support private-session rules for download persistence.
- [ ] Support extension and agent initiated download attribution.
- [ ] Support interruption reasons such as network, disk, permission, and policy errors.
- [x] Support host-owned filesystem paths while exposing safe display names.
- [x] Support trust-boundary schemas for incoming download events.
- [x] Support model-safe summaries of download activity.
- [x] Support future download scanning integrations.
- [x] Support platform-neutral command and record shapes.
- [x] Support tests for reducer transitions and risk helpers.
