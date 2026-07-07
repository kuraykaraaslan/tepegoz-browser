# @tepegoz/file-operations CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support folder-scoped file read capabilities.
- [ ] Support folder-scoped file write capabilities.
- [ ] Support folder-scoped append operations.
- [ ] Support folder-scoped directory creation.
- [ ] Support folder-scoped directory listing.
- [ ] Support folder-scoped file stat metadata.
- [ ] Support folder-scoped rename operations.
- [ ] Support folder-scoped copy operations.
- [ ] Support folder-scoped delete operations with destructive classification.
- [ ] Support canonical path resolution before grant checks.
- [ ] Support hard denial for paths outside all granted folders.
- [ ] Support read, read-write, and full grant modes.
- [ ] Support recursive and non-recursive folder grants.
- [ ] Support grant creation tools with user consent.
- [ ] Support grant update tools with user consent.
- [ ] Support grant deletion tools with user consent.
- [ ] Support policy decisions that distinguish allow, ask, and deny.
- [ ] Support membership checks inside every handler.
- [ ] Support mode checks for every mutating operation.
- [ ] Support UTF-8 and base64 file content transport.
- [ ] Support glob or pattern search inside granted folders.
- [ ] Support safe handling of symlinks and path traversal attempts.
- [ ] Support audit summaries that avoid leaking file contents.
- [ ] Support idempotency metadata for write-like operations.
- [ ] Support cancellation for long file searches and copies.
- [ ] Support platform-neutral directory entry metadata.
- [ ] Support injected filesystem host operations.
- [ ] Support injected grant persistence.
- [ ] Support tests over pure path policy decisions.
- [ ] Support future cloud or virtual filesystem hosts through the same interface.
