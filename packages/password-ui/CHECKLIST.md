# @tepegoz/password-ui CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a saved-credentials settings section.
- [x] Support searching saved credentials.
- [x] Support adding a new credential through injected callbacks.
- [ ] Support editing an existing credential through injected callbacks.
- [x] Support deleting credentials through injected callbacks.
- [ ] Support confirmation hooks for credential deletion.
- [x] Support metadata-only credential display.
- [ ] Support password reveal controls only when host policy allows.
- [ ] Support copy-username and copy-password actions through host callbacks.
- [x] Support import panel for CSV data.
- [x] Support drag-and-drop CSV import.
- [x] Support file-picker CSV import.
- [x] Support export controls for Google CSV format.
- [x] Support import result summaries with imported, skipped, and errors.
- [ ] Support inline validation for URL, username, and password fields.
- [ ] Support autofill suggestion dropdown near login fields.
- [x] Support selecting an autofill match.
- [x] Support dismissing autofill suggestions.
- [ ] Support accessible labels for forms, tables, and actions.
- [x] Support localized labels through the package dictionary.
- [x] Support empty state when no credentials exist.
- [ ] Support no-results state for search.
- [ ] Support loading and error states for injected data.
- [x] Support responsive layout inside settings pages.
- [ ] Support keyboard navigation in credential lists.
- [x] Support safe truncation for long URLs and usernames.
- [ ] Support provider badges on credential rows.
- [ ] Support high-contrast and reduced-motion friendly UI.
- [x] Support bridge-agnostic operation through injected callbacks.
- [x] Support future provider features without importing persistence logic.
