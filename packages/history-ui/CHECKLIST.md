# @tepegoz/history-ui CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a tepegoz browsing-history manager page.
- [x] Support newest-first history listing.
- [x] Support lazy pagination with a scroll sentinel.
- [x] Support search by page title.
- [x] Support search by URL.
- [x] Support search by hostname.
- [x] Support removing one history entry.
- [x] Support clearing all browsing history.
- [ ] Support confirmation hooks for clearing history.
- [ ] Support loading and retry states for history queries.
- [x] Support empty state for no history.
- [ ] Support no-results state for searches.
- [ ] Support grouping entries by day.
- [x] Support displaying relative or formatted visit times.
- [ ] Support favicon display with fallback icons.
- [ ] Support opening history entries through host navigation.
- [ ] Support opening entries in new tabs through host actions.
- [ ] Support keyboard navigation across history rows.
- [x] Support accessible labels for remove and clear actions.
- [x] Support localized labels through the package dictionary.
- [ ] Support responsive layout for internal browser pages.
- [ ] Support row context-menu entry points.
- [ ] Support multi-select removal workflows.
- [ ] Support filtering by date ranges.
- [ ] Support filtering by internal pages, web pages, and file pages.
- [ ] Support stable scroll position while loading additional pages.
- [ ] Support debounced search input.
- [x] Support safe truncation of long titles and URLs.
- [ ] Support privacy-friendly redaction hooks for sensitive entries.
- [x] Support bridge-agnostic operation through injected data callbacks.
