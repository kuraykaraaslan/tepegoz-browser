# @tepegoz/shared-types CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support canonical zod schemas for cross-layer contracts.
- [ ] Support inferred TypeScript types from the canonical schemas.
- [ ] Support avoiding duplicated schema definitions across packages.
- [ ] Support AI provider enums.
- [ ] Support policy decision enums.
- [ ] Support human-in-the-loop status enums.
- [ ] Support risk level enums.
- [ ] Support MCP transport enums.
- [ ] Support event type enums.
- [ ] Support tool source enums.
- [ ] Support tool error code enums.
- [ ] Support event journal record schemas.
- [ ] Support event journal input schemas.
- [ ] Support log sequence number fields.
- [ ] Support device ID fields.
- [ ] Support content-addressed blob reference fields.
- [ ] Support tool name validation with the shared naming convention.
- [ ] Support tool descriptor schemas.
- [ ] Support tool error schemas.
- [ ] Support safeParse validation at trust boundaries.
- [ ] Support zod-free inferred types where downstream packages need type-only imports.
- [ ] Support schema versioning for shared contracts.
- [ ] Support compatibility tests for enum values used by other packages.
- [ ] Support documentation for adding new shared enums.
- [ ] Support deprecation metadata for evolving fields.
- [ ] Support strict unknown-field policies where security matters.
- [ ] Support pass-through unknown-field policies where forward compatibility matters.
- [ ] Support stable serialized wire shapes for IPC and persistence.
- [ ] Support future notification, password, task, and tab shared contracts.
- [ ] Support dependency-light use by low-level packages.
