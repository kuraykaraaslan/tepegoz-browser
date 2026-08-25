/**
 * Public entry: the article MODEL only.
 *
 * `extract.ts` needs DOM types and `reader-view.tsx` needs JSX, and both would then be typechecked by
 * every package that merely wants `ReaderArticle` — including ones with neither lib configured. They
 * are reachable at `@tepegoz/reader/extract` and `@tepegoz/reader/view` instead, which keeps the cost
 * with the consumers that actually need them.
 */
export * from './article';
