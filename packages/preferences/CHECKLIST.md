# @tepegoz/preferences CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support persisted theme preferences.
- [x] Support persisted locale preferences.
- [x] Support persisted telemetry preferences.
- [x] Support persisted default AI provider preferences.
- [x] Support persisted cost-saver local-model toggle.
- [x] Support persisted extension enablement states.
- [x] Support persisted MCP server configurations.
- [x] Support persisted agent panel selections.
- [x] Support persisted local-model settings.
- [x] Support persisted file-access grants.
- [x] Support defaults for every preference key.
- [x] Support loading preferences from an injected file path.
- [x] Support validating preference files as untrusted input.
- [x] Support fallback to defaults on absent preference files.
- [x] Support fallback to defaults on corrupt preference files.
- [x] Support partial preference patch validation.
- [x] Support full preference object re-validation after patch merge.
- [x] Support immediate persistence after successful updates.
- [x] Support defensive copies for preference snapshots.
- [x] Support schema and type drift prevention against desktop IPC types.
- [x] Support reusable field schemas for theme, locale, provider, extensions, and MCP.
- [x] Support public settings validation for extension-facing reads.
- [x] Support private preference keys that never reach extensions.
- [x] Support reset seams for tests.
- [ ] Support versioned preference migrations.
- [ ] Support unknown-key handling for forward compatibility.
- [ ] Support clear validation errors for settings UI.
- [ ] Support profile-specific preference files when host paths differ.
- [x] Support atomic persistence through the JSON store.
- [x] Support future preference sections without duplicated enums.
