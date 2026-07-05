# @tepegoz/markdown

Markdown renderer for agent/assistant output, plus the remark plugin and URL sanitizer it depends on.
Renders to React elements only (never `dangerouslySetInnerHTML`), so it is XSS- and CSP-safe — no raw
HTML, no `eval`. GitHub-flavored markdown via `remark-gfm`; fenced code blocks are syntax-highlighted
(`rehype-highlight`, pure JS) with a language label and a copy button. A string-free leaf: the one
localizable bit (the copy button's label) is passed in as a prop, not hardcoded.

## Exports
- **`Markdown`** (+ `MarkdownProps`) — the renderer component. Props: `source`, `onOpenLink` (called
  when an `http(s)` link is clicked — links never navigate the renderer itself), `onOpenFile` (called
  when a linkified file path is clicked, gated by the host to allowed folders), `copyLabel` (defaults
  to `"Copy"`), `className`.
- **`remarkFileLinks`** — a remark (mdast) plugin factory that turns absolute filesystem paths
  appearing in prose (e.g. "saved to `C:\Users\…\notes.txt`") into clickable links, so the agent's
  output becomes actionable. Text inside code/inline-code and existing links are left untouched.
- **`linkifyText(value)`** — the pure text → text/link-node splitter behind `remarkFileLinks`. Returns
  `null` when no path is found.
- **`FILE_LINK_SCHEME`** — the `tepegoz-file:` URL scheme used to mark a linkified file path; the
  `Markdown` component's link renderer recognizes it and never places it in the DOM as a navigable
  `href` (it renders `#` and carries the path via the click closure instead).
- **`fileUrlTransform(url)`** — the `urlTransform` passed to `ReactMarkdown`. React-markdown's default
  transform strips any href whose scheme isn't in its safe list, which would blank internal
  `tepegoz-file:` links; this preserves only that one scheme and delegates everything else to the
  default (so `javascript:`/`data:` and other unsafe schemes still get stripped).

## Notes
- React is a peer dependency (`^18 || ^19`); this package has no other framework binding.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
