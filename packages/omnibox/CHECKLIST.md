# @tepegoz/omnibox CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support controlled display of the active tab URL.
- [x] Support preserving typed input while the user edits.
- [x] Support submitting typed input through injected navigation callbacks.
- [x] Support inline arithmetic evaluation.
- [x] Support displaying calculator result chips.
- [x] Support deterministic suggestion building from injected sources.
- [x] Support history suggestions.
- [x] Support open-tab suggestions.
- [x] Support search suggestions.
- [x] Support bookmark suggestions.
- [x] Support activating an existing tab from suggestions.
- [x] Support parsing omnibox query scope and action intent.
- [x] Support detecting navigable-looking inputs.
- [x] Support capping suggestion counts.
- [x] Support keyboard navigation through suggestions.
- [x] Support Enter selection and Escape dismissal.
- [x] Support mouse selection of suggestions.
- [x] Support accessible combobox and listbox semantics.
- [x] Support localized placeholders and suggestion labels.
- [x] Support safe truncation of long URLs.
- [ ] Support displaying hostnames clearly.
- [x] Support paste handling without unsafe direct navigation.
- [x] Support copy-friendly selected URL behavior.
- [x] Support focus and blur behavior matching desktop browsers.
- [ ] Support page security or internal-page indicators from the host.
- [ ] Support IME-friendly text entry.
- [ ] Support RTL input handling for search terms.
- [x] Support no-AI behavior for calculator and suggestions.
- [x] Support bridge-agnostic operation through injected callbacks.
- [x] Support pure tests for calculator, parsing, and suggestion helpers.
