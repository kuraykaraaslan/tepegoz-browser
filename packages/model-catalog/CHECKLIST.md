# @tepegoz/model-catalog CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a versioned local model catalog file.
- [ ] Support validating model catalog entries at the trust boundary.
- [ ] Support retaining valid model entries when some entries are malformed.
- [ ] Support duplicate model-id detection.
- [ ] Support model metadata such as name, URL, size, quantization, and context length.
- [ ] Support model parameter-count metadata.
- [ ] Support recommended and first-party flags.
- [ ] Support license metadata.
- [ ] Support minimum RAM requirements.
- [ ] Support catalog-driven model additions without code changes.
- [ ] Support install-state records per model.
- [ ] Support downloading, installed, and error install statuses.
- [ ] Support byte-progress tracking for downloads.
- [ ] Support resumable downloads through HTTP Range requests.
- [ ] Support cooperative cancellation during downloads.
- [ ] Support injected network and disk I/O for download orchestration.
- [ ] Support streaming SHA-256 verification.
- [ ] Support in-memory SHA-256 verification for tests.
- [ ] Support case-insensitive digest comparison.
- [ ] Support mandatory integrity verification before model use.
- [ ] Support immutable install-state helper updates.
- [ ] Support lenient install-state loading that drops malformed records.
- [ ] Support removing install records.
- [ ] Support finding install records by model ID.
- [ ] Support progress callbacks for model download UI.
- [ ] Support restart after interrupted downloads.
- [ ] Support file-path metadata owned by the host.
- [ ] Support catalog errors suitable for settings diagnostics.
- [ ] Support tests over fake download streams.
- [ ] Support future model sources behind the same catalog shape.
