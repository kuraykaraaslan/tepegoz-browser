# @tepegoz/credential-vault CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support storing multiple API keys per provider.
- [x] Support labeling provider keys for user recognition.
- [x] Support ordering provider keys by priority.
- [x] Support selecting the top provider from stored key metadata.
- [x] Support adding keys with immediate encrypted persistence.
- [x] Support removing keys idempotently.
- [x] Support renaming keys without changing encrypted secret material.
- [x] Support reordering keys with validation of known identifiers.
- [x] Support listing renderer-safe key metadata only.
- [x] Support provider-level key status without exposing ciphertext.
- [x] Support decrypting a key only through main-process APIs.
- [x] Support injected OS-backed crypto implementations.
- [x] Support encryption availability checks before accepting secrets.
- [x] Support base64 ciphertext persistence in a JSON store.
- [x] Support versioned on-disk vault format.
- [x] Support migration from legacy flat provider-key maps.
- [x] Support dropping malformed records without discarding valid keys.
- [x] Support unknown-provider filtering at load time.
- [x] Support stable key identifiers across app restarts.
- [x] Support last-four metadata for key recognition.
- [x] Support created-at metadata for audit and ordering.
- [x] Support reset seams for tests.
- [x] Support secure error messages that never include raw keys.
- [ ] Support provider-specific metadata extension without exposing secrets.
- [ ] Support backup and restore flows that preserve encrypted values.
- [ ] Support account or profile separation when hosts provide separate file paths.
- [x] Support safe concurrent mutations through serialized persistence.
- [ ] Support import/export of metadata without secret material.
- [ ] Support secret rotation workflows across multiple providers.
- [x] Support future keychain providers through the same crypto interface.
