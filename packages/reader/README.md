# @tepegoz/reader

The **reading view** — article extraction and rendering for browsed web pages. The security decision
the whole feature rests on: a reader view renders the body of an arbitrary page inside the *trusted*
app chrome, so it takes **structured typed blocks with plain-text fields, never HTML**. There is no
`html` field anywhere and the renderer has no `dangerouslySetInnerHTML` — injection is structurally
impossible rather than filtered against. The accepted cost is that rich inline markup is flattened to
text; links survive as their own block kind because losing an href is worse than losing an underline.

## Entry points

The package is split so a consumer that only wants the `ReaderArticle` type never drags in DOM or JSX
typechecking:

- **`@tepegoz/reader`** — the article **model only** (`ReaderArticle`, `ReaderBlock`,
  `READER_LIMITS`, `readingMinutes`). No `lib.dom`, no React.
- **`@tepegoz/reader/extract`** — `extractArticle(document)`: Readability-style scoring (link
  density + negative class/id name penalty) written against a plain `Document`, so it runs inside the
  page with no jsdom and is exercised directly under vitest. Every field is bounded — the page is
  untrusted input.
- **`@tepegoz/reader/view`** — `ReaderView`, the React component that renders the block list.
- **`@tepegoz/reader/i18n`** — the `en`/`tr` dictionary (parity-tested).

`READER_LIMITS` caps everything the page can make the app hold: 2000 blocks, 20k chars per text
block, 500 list items, and title/byline/src ceilings. `image` `src` is validated to
`http(s)`/`data:image` before it leaves the page.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
