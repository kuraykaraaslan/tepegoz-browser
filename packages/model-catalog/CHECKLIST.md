# @tepegoz/model-catalog CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a versioned local model catalog file.
- [x] Support validating model catalog entries at the trust boundary.
- [x] Support retaining valid model entries when some entries are malformed.
- [x] Support duplicate model-id detection.
- [x] Support model metadata such as name, URL, size, quantization, and context length.
- [x] Support model parameter-count metadata.
- [x] Support recommended and first-party flags.
- [x] Support license metadata.
- [ ] Support minimum RAM requirements.
- [x] Support catalog-driven model additions without code changes.
- [x] Support install-state records per model.
- [x] Support downloading, installed, and error install statuses.
- [x] Support byte-progress tracking for downloads.
- [ ] Support resumable downloads through HTTP Range requests.
- [x] Support cooperative cancellation during downloads.
- [x] Support injected network and disk I/O for download orchestration.
- [x] Support streaming SHA-256 verification.
- [x] Support in-memory SHA-256 verification for tests.
- [x] Support case-insensitive digest comparison.
- [ ] Support mandatory integrity verification before model use.
- [x] Support immutable install-state helper updates.
- [x] Support lenient install-state loading that drops malformed records.
- [x] Support removing install records.
- [x] Support finding install records by model ID.
- [x] Support progress callbacks for model download UI.
- [ ] Support restart after interrupted downloads.
- [x] Support file-path metadata owned by the host.
- [x] Support catalog errors suitable for settings diagnostics.
- [x] Support tests over fake download streams.
- [ ] Support future model sources behind the same catalog shape.
