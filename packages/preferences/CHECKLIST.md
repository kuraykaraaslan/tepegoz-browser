# @tepegoz/preferences CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support persisted theme preferences.
- [ ] Support persisted locale preferences.
- [ ] Support persisted telemetry preferences.
- [ ] Support persisted default AI provider preferences.
- [ ] Support persisted cost-saver local-model toggle.
- [ ] Support persisted extension enablement states.
- [ ] Support persisted MCP server configurations.
- [ ] Support persisted agent panel selections.
- [ ] Support persisted local-model settings.
- [ ] Support persisted file-access grants.
- [ ] Support defaults for every preference key.
- [ ] Support loading preferences from an injected file path.
- [ ] Support validating preference files as untrusted input.
- [ ] Support fallback to defaults on absent preference files.
- [ ] Support fallback to defaults on corrupt preference files.
- [ ] Support partial preference patch validation.
- [ ] Support full preference object re-validation after patch merge.
- [ ] Support immediate persistence after successful updates.
- [ ] Support defensive copies for preference snapshots.
- [ ] Support schema and type drift prevention against desktop IPC types.
- [ ] Support reusable field schemas for theme, locale, provider, extensions, and MCP.
- [ ] Support public settings validation for extension-facing reads.
- [ ] Support private preference keys that never reach extensions.
- [ ] Support reset seams for tests.
- [ ] Support versioned preference migrations.
- [ ] Support unknown-key handling for forward compatibility.
- [ ] Support clear validation errors for settings UI.
- [ ] Support profile-specific preference files when host paths differ.
- [ ] Support atomic persistence through the JSON store.
- [ ] Support future preference sections without duplicated enums.
