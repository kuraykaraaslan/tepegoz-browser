# @tepegoz/file-operations CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support folder-scoped file read capabilities.
- [x] Support folder-scoped file write capabilities.
- [x] Support folder-scoped append operations.
- [x] Support folder-scoped directory creation.
- [x] Support folder-scoped directory listing.
- [x] Support folder-scoped file stat metadata.
- [x] Support folder-scoped rename operations.
- [x] Support folder-scoped copy operations.
- [x] Support folder-scoped delete operations with destructive classification.
- [x] Support canonical path resolution before grant checks.
- [x] Support hard denial for paths outside all granted folders.
- [x] Support read, read-write, and full grant modes.
- [x] Support recursive and non-recursive folder grants.
- [x] Support grant creation tools with user consent.
- [x] Support grant update tools with user consent.
- [x] Support grant deletion tools with user consent.
- [x] Support policy decisions that distinguish allow, ask, and deny.
- [x] Support membership checks inside every handler.
- [x] Support mode checks for every mutating operation.
- [x] Support UTF-8 and base64 file content transport.
- [x] Support glob or pattern search inside granted folders.
- [x] Support safe handling of symlinks and path traversal attempts.
- [x] Support audit summaries that avoid leaking file contents.
- [x] Support idempotency metadata for write-like operations.
- [ ] Support cancellation for long file searches and copies.
- [x] Support platform-neutral directory entry metadata.
- [x] Support injected filesystem host operations.
- [x] Support injected grant persistence.
- [x] Support tests over pure path policy decisions.
- [x] Support future cloud or virtual filesystem hosts through the same interface.
