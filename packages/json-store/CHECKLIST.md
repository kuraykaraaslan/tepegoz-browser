# @tepegoz/json-store CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support reading JSON files from host-provided paths.
- [x] Support returning undefined when a JSON file does not exist.
- [x] Support returning undefined when a JSON file fails to parse.
- [x] Support treating parsed JSON as unknown until callers validate it.
- [x] Support crash-safe writes through temporary sibling files.
- [x] Support fsync before replacing the target file.
- [x] Support atomic rename over the target file.
- [x] Support parent directory creation during writes.
- [x] Support pretty or deterministic JSON serialization when requested.
- [x] Support preserving valid stored data during interrupted writes.
- [ ] Support clear errors for write permission failures.
- [x] Support safe behavior on power loss during persistence.
- [x] Support platform-neutral file path handling.
- [x] Support Node-only operation without Electron imports.
- [x] Support tests with temporary filesystem directories.
- [x] Support callers such as preferences and credential vaults.
- [x] Support schema migration callers by returning raw parsed data.
- [ ] Support large JSON file safeguards through caller-provided limits.
- [ ] Support optional backup file creation for critical stores.
- [ ] Support optional recovery from backup files.
- [ ] Support file locking or serialized writes for concurrent callers.
- [ ] Support redaction-friendly error messages.
- [x] Support UTF-8 encoding consistency.
- [ ] Support detecting and ignoring partial temp files.
- [x] Support writing arrays, objects, and primitive JSON values.
- [ ] Support stable newline behavior for repo and platform consistency.
- [x] Support future encrypted store wrappers above the same primitives.
- [ ] Support diagnostics hooks for read and write outcomes.
- [x] Support documentation that reminds callers to validate with schemas.
- [x] Support minimal dependency footprint for main-process stores.
