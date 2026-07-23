# @tepegoz/extensions-ui CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a searchable extensions manager page.
- [x] Support extension cards with icon, name, description, metadata, and enabled state.
- [x] Support enable and disable toggles through injected callbacks.
- [x] Support filtering by extension name and description.
- [ ] Support empty state when no extensions are available.
- [x] Support no-results state for search.
- [ ] Support loading and retry states supplied by the host.
- [ ] Support card badges for built-in, first-party, beta, and experimental extensions.
- [ ] Support permission summaries on extension cards.
- [x] Support version display on extension cards.
- [ ] Support extension detail entry points.
- [ ] Support keyboard navigation across extension cards.
- [x] Support accessible toggle labels for each extension.
- [x] Support localized labels through the package dictionary.
- [x] Support responsive grid layout for narrow internal pages.
- [ ] Support high-contrast enabled and disabled states.
- [ ] Support reduced-motion friendly card transitions.
- [x] Support host-provided icons without registry dependencies.
- [ ] Support sorted display by recommended status, name, or enabled state.
- [ ] Support category filters when the host supplies category metadata.
- [ ] Support update availability indicators.
- [ ] Support warning indicators for risky permissions.
- [ ] Support disabled toggle states when policy prevents changes.
- [ ] Support confirmation hooks for disabling critical extensions.
- [ ] Support extension error states and recovery actions.
- [ ] Support deep links to a specific extension card.
- [ ] Support stable card IDs for automated tests.
- [ ] Support safe truncation for long extension names.
- [ ] Support RTL layouts for localized text.
- [x] Support bridge-agnostic operation through injected items and callbacks.
