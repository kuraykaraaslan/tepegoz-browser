# @tepegoz/uploads-ui CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a tepegoz uploads activity page.
- [x] Support injected callbacks for listing upload records.
- [x] Support injected callbacks for upload commands.
- [x] Support injected subscription callbacks for live updates.
- [x] Support upload records without local path exposure.
- [ ] Support status sections for pending, completed, failed, and canceled uploads.
- [x] Support risk indicators for sensitive upload activity.
- [x] Support source origin display with safe truncation.
- [x] Support file display names and sizes.
- [x] Support multi-file upload summaries.
- [x] Support cancel actions for pending uploads when supplied.
- [ ] Support retry actions for failed uploads when supplied.
- [ ] Support clear-all or clear-completed actions through host callbacks.
- [ ] Support search by filename and source origin.
- [ ] Support filtering by status and risk.
- [ ] Support sorting by newest, filename, size, and risk.
- [x] Support empty state for no uploads.
- [ ] Support loading and retry states for initial data retrieval.
- [x] Support localized English and Turkish strings from the package.
- [ ] Support keyboard navigation across upload rows.
- [ ] Support accessible labels for status and command buttons.
- [ ] Support row context-menu entry points.
- [x] Support subscription cleanup on unmount.
- [ ] Support responsive layout for narrow internal pages.
- [ ] Support high-contrast status badges.
- [ ] Support reduced-motion friendly live updates.
- [ ] Support inline policy-denied explanations.
- [x] Support stable row identity during updates.
- [x] Support bridge-agnostic operation through injected callbacks.
- [ ] Support future upload command types without owning desktop logic.
