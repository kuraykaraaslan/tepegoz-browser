# @tepegoz/downloads-ui CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a tepegoz downloads activity page.
- [x] Support injected callbacks for listing downloads.
- [x] Support injected callbacks for download commands.
- [x] Support injected subscription callbacks for live updates.
- [ ] Support sections for active, completed, failed, and canceled downloads.
- [x] Support progress bars for active downloads.
- [ ] Support pause, resume, cancel, retry, open, and reveal actions when supplied.
- [x] Support dangerous-download warning rows.
- [x] Support quarantine or scan-pending status indicators.
- [ ] Support search by filename and source host.
- [ ] Support filtering by download status.
- [ ] Support sorting by newest, oldest, filename, size, and risk.
- [x] Support clearing completed downloads through host action.
- [x] Support empty state for no downloads.
- [ ] Support loading and retry states for initial list retrieval.
- [ ] Support keyboard navigation across download rows.
- [ ] Support accessible labels for progress and action buttons.
- [x] Support localized English and Turkish strings from the package.
- [x] Support redacted display of local paths.
- [x] Support source URL display with safe truncation.
- [ ] Support file-size and time formatting through host or utility props.
- [ ] Support responsive layout for narrow internal pages.
- [ ] Support toast or inline feedback after commands.
- [ ] Support row context-menu entry points.
- [ ] Support multi-select cleanup actions.
- [ ] Support badges for source type, risk, and completion status.
- [ ] Support reduced-motion friendly progress updates.
- [ ] Support high-contrast visual states.
- [x] Support subscription cleanup on unmount.
- [x] Support stable row identity for live updates.
