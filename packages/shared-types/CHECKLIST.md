# @tepegoz/shared-types CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support canonical zod schemas for cross-layer contracts.
- [x] Support inferred TypeScript types from the canonical schemas.
- [x] Support avoiding duplicated schema definitions across packages.
- [x] Support AI provider enums.
- [x] Support policy decision enums.
- [x] Support human-in-the-loop status enums.
- [x] Support risk level enums.
- [x] Support MCP transport enums.
- [x] Support event type enums.
- [x] Support tool source enums.
- [x] Support tool error code enums.
- [x] Support event journal record schemas.
- [x] Support event journal input schemas.
- [x] Support log sequence number fields.
- [x] Support device ID fields.
- [x] Support content-addressed blob reference fields.
- [x] Support tool name validation with the shared naming convention.
- [x] Support tool descriptor schemas.
- [x] Support tool error schemas.
- [x] Support safeParse validation at trust boundaries.
- [x] Support zod-free inferred types where downstream packages need type-only imports.
- [ ] Support schema versioning for shared contracts.
- [ ] Support compatibility tests for enum values used by other packages.
- [ ] Support documentation for adding new shared enums.
- [ ] Support deprecation metadata for evolving fields.
- [ ] Support strict unknown-field policies where security matters.
- [ ] Support pass-through unknown-field policies where forward compatibility matters.
- [x] Support stable serialized wire shapes for IPC and persistence.
- [ ] Support future notification, password, task, and tab shared contracts.
- [x] Support dependency-light use by low-level packages.
