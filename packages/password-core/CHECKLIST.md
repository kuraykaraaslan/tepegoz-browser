# @tepegoz/password-core CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a provider-agnostic password manager interface.
- [x] Support registering multiple password providers.
- [x] Support retrieving a provider by identifier.
- [x] Support listing registered providers.
- [x] Support aggregating credentials across providers.
- [x] Support finding credentials by URL origin.
- [x] Support listing all credential metadata.
- [x] Support provider capability flags for write, import, export, and sync.
- [x] Support metadata-only credential shapes for IPC-safe surfaces.
- [x] Support full credential shapes for main-process-only use.
- [x] Support new credential input shapes with plaintext only at write time.
- [x] Support import format metadata shared across providers.
- [x] Support export format metadata shared across providers.
- [x] Support import result summaries with imported, skipped, and error counts.
- [x] Support autofill availability payloads for renderer notification.
- [x] Support shared crypto interface re-export for providers.
- [x] Support provider reset seams for tests.
- [x] Support origin normalization before provider searches.
- [x] Support duplicate provider ID handling.
- [ ] Support provider display names for settings UI.
- [ ] Support future providers such as Bitwarden or browser importers.
- [ ] Support sync-capable providers without changing UI contracts.
- [x] Support read-only providers that delegate writes elsewhere.
- [x] Support policy-friendly distinction between metadata and secrets.
- [x] Support secure error envelopes that avoid password leakage.
- [ ] Support credential tags, notes, and grouping metadata.
- [ ] Support passkey or credential-type extension fields.
- [x] Support audit attribution to the provider that served a credential.
- [x] Support tests over aggregation and origin matching.
- [x] Support documentation for implementing a new password provider.
