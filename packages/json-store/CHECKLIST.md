# @tepegoz/json-store CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support reading JSON files from host-provided paths.
- [ ] Support returning undefined when a JSON file does not exist.
- [ ] Support returning undefined when a JSON file fails to parse.
- [ ] Support treating parsed JSON as unknown until callers validate it.
- [ ] Support crash-safe writes through temporary sibling files.
- [ ] Support fsync before replacing the target file.
- [ ] Support atomic rename over the target file.
- [ ] Support parent directory creation during writes.
- [ ] Support pretty or deterministic JSON serialization when requested.
- [ ] Support preserving valid stored data during interrupted writes.
- [ ] Support clear errors for write permission failures.
- [ ] Support safe behavior on power loss during persistence.
- [ ] Support platform-neutral file path handling.
- [ ] Support Node-only operation without Electron imports.
- [ ] Support tests with temporary filesystem directories.
- [ ] Support callers such as preferences and credential vaults.
- [ ] Support schema migration callers by returning raw parsed data.
- [ ] Support large JSON file safeguards through caller-provided limits.
- [ ] Support optional backup file creation for critical stores.
- [ ] Support optional recovery from backup files.
- [ ] Support file locking or serialized writes for concurrent callers.
- [ ] Support redaction-friendly error messages.
- [ ] Support UTF-8 encoding consistency.
- [ ] Support detecting and ignoring partial temp files.
- [ ] Support writing arrays, objects, and primitive JSON values.
- [ ] Support stable newline behavior for repo and platform consistency.
- [ ] Support future encrypted store wrappers above the same primitives.
- [ ] Support diagnostics hooks for read and write outcomes.
- [ ] Support documentation that reminds callers to validate with schemas.
- [ ] Support minimal dependency footprint for main-process stores.
