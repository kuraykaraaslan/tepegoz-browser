# @tepegoz/password-vault CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a local encrypted password provider.
- [ ] Support initialization with injected database and crypto dependencies.
- [ ] Support listing credential metadata.
- [ ] Support finding credentials by identifier.
- [ ] Support finding credentials by URL origin.
- [ ] Support creating credentials with encrypted passwords.
- [ ] Support updating credentials by normalized origin and username.
- [ ] Support removing credentials by identifier.
- [ ] Support decrypting credentials only through main-process-only APIs.
- [ ] Support generic CSV import.
- [ ] Support generic CSV export.
- [ ] Support import result summaries with imported, skipped, and errors.
- [ ] Support parsing CSV header rows.
- [ ] Support required URL, username, and password validation during import.
- [ ] Support note fields during import and export.
- [ ] Support password encryption before disk persistence.
- [ ] Support raw password avoidance in IPC-safe metadata.
- [ ] Support origin normalization for lookup and upsert.
- [ ] Support duplicate handling for same origin and username.
- [ ] Support SQLite CRUD over login credential records.
- [ ] Support stable credential identifiers.
- [ ] Support created-at and updated-at metadata.
- [ ] Support provider capability flags for write, import, and export.
- [ ] Support reset seams for tests.
- [ ] Support secure errors that never include plaintext passwords.
- [ ] Support migration-friendly record shapes from persistence tables.
- [ ] Support audit-friendly operation summaries without secrets.
- [ ] Support future sync metadata without exposing decrypted values.
- [ ] Support passkey or credential-type metadata extension.
- [ ] Support documentation for safe main-process usage.
