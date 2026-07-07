# @tepegoz/markdown CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support rendering Markdown to React elements without raw HTML injection.
- [ ] Support GitHub-flavored Markdown tables, task lists, and strikethrough.
- [ ] Support fenced code blocks with syntax highlighting.
- [ ] Support visible language labels for code blocks.
- [ ] Support copy buttons for code blocks.
- [ ] Support localized copy labels supplied by callers.
- [ ] Support safe link rendering for http and https URLs.
- [ ] Support injected link-open callbacks instead of direct renderer navigation.
- [ ] Support filesystem path linkification in prose.
- [ ] Support leaving paths inside code spans untouched.
- [ ] Support leaving existing links untouched during path linkification.
- [ ] Support internal file-link scheme handling.
- [ ] Support host-gated file-open callbacks.
- [ ] Support URL sanitization that rejects javascript and data schemes.
- [ ] Support preserving the internal file scheme through URL transformation.
- [ ] Support inline code rendering.
- [ ] Support blockquotes, ordered lists, and unordered lists.
- [ ] Support accessible headings and semantic structure.
- [ ] Support long-line wrapping for assistant output.
- [ ] Support dark and light theme code highlighting.
- [ ] Support error boundaries around malformed Markdown rendering.
- [ ] Support streaming-friendly incremental source updates.
- [ ] Support redacted or untrusted content boundaries in rendered text.
- [ ] Support custom class names from host components.
- [ ] Support image handling rules suitable for CSP-safe renderers.
- [ ] Support footnotes or reference links when allowed by the Markdown pipeline.
- [ ] Support deterministic pure tests for file linkification.
- [ ] Support safe rendering under strict Content Security Policy.
- [ ] Support React 18 and React 19 peer usage.
- [ ] Support future remark plugins without exposing unsafe HTML.
