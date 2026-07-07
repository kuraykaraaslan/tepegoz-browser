# @tepegoz/credential-vault CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support storing multiple API keys per provider.
- [ ] Support labeling provider keys for user recognition.
- [ ] Support ordering provider keys by priority.
- [ ] Support selecting the top provider from stored key metadata.
- [ ] Support adding keys with immediate encrypted persistence.
- [ ] Support removing keys idempotently.
- [ ] Support renaming keys without changing encrypted secret material.
- [ ] Support reordering keys with validation of known identifiers.
- [ ] Support listing renderer-safe key metadata only.
- [ ] Support provider-level key status without exposing ciphertext.
- [ ] Support decrypting a key only through main-process APIs.
- [ ] Support injected OS-backed crypto implementations.
- [ ] Support encryption availability checks before accepting secrets.
- [ ] Support base64 ciphertext persistence in a JSON store.
- [ ] Support versioned on-disk vault format.
- [ ] Support migration from legacy flat provider-key maps.
- [ ] Support dropping malformed records without discarding valid keys.
- [ ] Support unknown-provider filtering at load time.
- [ ] Support stable key identifiers across app restarts.
- [ ] Support last-four metadata for key recognition.
- [ ] Support created-at metadata for audit and ordering.
- [ ] Support reset seams for tests.
- [ ] Support secure error messages that never include raw keys.
- [ ] Support provider-specific metadata extension without exposing secrets.
- [ ] Support backup and restore flows that preserve encrypted values.
- [ ] Support account or profile separation when hosts provide separate file paths.
- [ ] Support safe concurrent mutations through serialized persistence.
- [ ] Support import/export of metadata without secret material.
- [ ] Support secret rotation workflows across multiple providers.
- [ ] Support future keychain providers through the same crypto interface.
