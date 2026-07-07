# @tepegoz/password-provider-google-csv CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support importing Google Password Manager CSV data.
- [ ] Support exporting credentials in Google-compatible CSV format.
- [ ] Support provider metadata identifying the Google CSV source.
- [ ] Support read-only provider behavior for stored credential queries.
- [ ] Support delegating imported credentials to the local vault provider.
- [ ] Support delegating export to the local vault provider.
- [ ] Support parsing header rows.
- [ ] Support importing CSV files without header rows.
- [ ] Support auto-detecting name, URL, username, password, and note columns.
- [ ] Support quoted CSV fields.
- [ ] Support embedded commas inside quoted fields.
- [ ] Support escaped quotes inside quoted fields.
- [ ] Support filtering rows that lack URL, username, or password.
- [ ] Support row-level error collection.
- [ ] Support imported, skipped, and error counts.
- [ ] Support preserving notes where the format allows it.
- [ ] Support preserving display names where the format allows it.
- [ ] Support URL normalization before local vault insertion.
- [ ] Support duplicate handling through the delegated local provider.
- [ ] Support safe handling of very large CSV input.
- [ ] Support UTF-8 CSV data.
- [ ] Support CRLF and LF line endings.
- [ ] Support formula-injection-safe CSV export.
- [ ] Support deterministic column ordering on export.
- [ ] Support clear errors when the local provider is unavailable.
- [ ] Support no-secret logging during import failures.
- [ ] Support tests for malformed and quoted CSV cases.
- [ ] Support future Google CSV column variants.
- [ ] Support documentation for user import and export flows.
- [ ] Support provider capability flags that communicate import and export only.
