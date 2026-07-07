# @tepegoz/password-core CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a provider-agnostic password manager interface.
- [ ] Support registering multiple password providers.
- [ ] Support retrieving a provider by identifier.
- [ ] Support listing registered providers.
- [ ] Support aggregating credentials across providers.
- [ ] Support finding credentials by URL origin.
- [ ] Support listing all credential metadata.
- [ ] Support provider capability flags for write, import, export, and sync.
- [ ] Support metadata-only credential shapes for IPC-safe surfaces.
- [ ] Support full credential shapes for main-process-only use.
- [ ] Support new credential input shapes with plaintext only at write time.
- [ ] Support import format metadata shared across providers.
- [ ] Support export format metadata shared across providers.
- [ ] Support import result summaries with imported, skipped, and error counts.
- [ ] Support autofill availability payloads for renderer notification.
- [ ] Support shared crypto interface re-export for providers.
- [ ] Support provider reset seams for tests.
- [ ] Support origin normalization before provider searches.
- [ ] Support duplicate provider ID handling.
- [ ] Support provider display names for settings UI.
- [ ] Support future providers such as Bitwarden or browser importers.
- [ ] Support sync-capable providers without changing UI contracts.
- [ ] Support read-only providers that delegate writes elsewhere.
- [ ] Support policy-friendly distinction between metadata and secrets.
- [ ] Support secure error envelopes that avoid password leakage.
- [ ] Support credential tags, notes, and grouping metadata.
- [ ] Support passkey or credential-type extension fields.
- [ ] Support audit attribution to the provider that served a credential.
- [ ] Support tests over aggregation and origin matching.
- [ ] Support documentation for implementing a new password provider.
