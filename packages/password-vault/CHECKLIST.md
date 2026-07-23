# @tepegoz/password-vault CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a local encrypted password provider.
- [x] Support initialization with injected database and crypto dependencies.
- [x] Support listing credential metadata.
- [x] Support finding credentials by identifier.
- [x] Support finding credentials by URL origin.
- [x] Support creating credentials with encrypted passwords.
- [x] Support updating credentials by normalized origin and username.
- [x] Support removing credentials by identifier.
- [x] Support decrypting credentials only through main-process-only APIs.
- [x] Support generic CSV import.
- [x] Support generic CSV export.
- [x] Support import result summaries with imported, skipped, and errors.
- [x] Support parsing CSV header rows.
- [x] Support required URL, username, and password validation during import.
- [ ] Support note fields during import and export.
- [x] Support password encryption before disk persistence.
- [x] Support raw password avoidance in IPC-safe metadata.
- [x] Support origin normalization for lookup and upsert.
- [x] Support duplicate handling for same origin and username.
- [x] Support SQLite CRUD over login credential records.
- [x] Support stable credential identifiers.
- [x] Support created-at and updated-at metadata.
- [x] Support provider capability flags for write, import, and export.
- [x] Support reset seams for tests.
- [x] Support secure errors that never include plaintext passwords.
- [x] Support migration-friendly record shapes from persistence tables.
- [ ] Support audit-friendly operation summaries without secrets.
- [ ] Support future sync metadata without exposing decrypted values.
- [ ] Support passkey or credential-type metadata extension.
- [x] Support documentation for safe main-process usage.
