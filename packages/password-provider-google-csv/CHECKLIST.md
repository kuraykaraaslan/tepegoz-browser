# @tepegoz/password-provider-google-csv CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support importing Google Password Manager CSV data.
- [x] Support exporting credentials in Google-compatible CSV format.
- [x] Support provider metadata identifying the Google CSV source.
- [x] Support read-only provider behavior for stored credential queries.
- [x] Support delegating imported credentials to the local vault provider.
- [x] Support delegating export to the local vault provider.
- [x] Support parsing header rows.
- [x] Support importing CSV files without header rows.
- [ ] Support auto-detecting name, URL, username, password, and note columns.
- [x] Support quoted CSV fields.
- [x] Support embedded commas inside quoted fields.
- [x] Support escaped quotes inside quoted fields.
- [x] Support filtering rows that lack URL, username, or password.
- [x] Support row-level error collection.
- [ ] Support imported, skipped, and error counts.
- [x] Support preserving notes where the format allows it.
- [x] Support preserving display names where the format allows it.
- [x] Support URL normalization before local vault insertion.
- [x] Support duplicate handling through the delegated local provider.
- [ ] Support safe handling of very large CSV input.
- [x] Support UTF-8 CSV data.
- [x] Support CRLF and LF line endings.
- [ ] Support formula-injection-safe CSV export.
- [x] Support deterministic column ordering on export.
- [ ] Support clear errors when the local provider is unavailable.
- [x] Support no-secret logging during import failures.
- [x] Support tests for malformed and quoted CSV cases.
- [ ] Support future Google CSV column variants.
- [ ] Support documentation for user import and export flows.
- [x] Support provider capability flags that communicate import and export only.
