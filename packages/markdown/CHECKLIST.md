# @tepegoz/markdown CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support rendering Markdown to React elements without raw HTML injection.
- [x] Support GitHub-flavored Markdown tables, task lists, and strikethrough.
- [x] Support fenced code blocks with syntax highlighting.
- [x] Support visible language labels for code blocks.
- [x] Support copy buttons for code blocks.
- [x] Support localized copy labels supplied by callers.
- [x] Support safe link rendering for http and https URLs.
- [x] Support injected link-open callbacks instead of direct renderer navigation.
- [x] Support filesystem path linkification in prose.
- [x] Support leaving paths inside code spans untouched.
- [ ] Support leaving existing links untouched during path linkification.
- [x] Support internal file-link scheme handling.
- [x] Support host-gated file-open callbacks.
- [x] Support URL sanitization that rejects javascript and data schemes.
- [x] Support preserving the internal file scheme through URL transformation.
- [x] Support inline code rendering.
- [x] Support blockquotes, ordered lists, and unordered lists.
- [x] Support accessible headings and semantic structure.
- [ ] Support long-line wrapping for assistant output.
- [ ] Support dark and light theme code highlighting.
- [ ] Support error boundaries around malformed Markdown rendering.
- [ ] Support streaming-friendly incremental source updates.
- [ ] Support redacted or untrusted content boundaries in rendered text.
- [x] Support custom class names from host components.
- [ ] Support image handling rules suitable for CSP-safe renderers.
- [x] Support footnotes or reference links when allowed by the Markdown pipeline.
- [x] Support deterministic pure tests for file linkification.
- [x] Support safe rendering under strict Content Security Policy.
- [x] Support React 18 and React 19 peer usage.
- [ ] Support future remark plugins without exposing unsafe HTML.
