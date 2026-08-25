/**
 * The shape a reading view renders — **structured blocks, never HTML**.
 *
 * This is the security decision the whole feature rests on. A reader view takes the body of an
 * arbitrary web page and renders it inside the TRUSTED app chrome, which is the one place in this
 * browser where injected markup would run with the chrome's privileges. Filtering HTML to make that
 * safe is a game you have to keep winning; handing the renderer a list of typed blocks with plain-text
 * fields is a game there is nothing to play. There is no `html` field anywhere in this file, and the
 * renderer has no `dangerouslySetInnerHTML` — injection is structurally impossible rather than
 * defended against.
 *
 * The cost is real and accepted: rich inline markup (links inside a paragraph, bold, code spans) is
 * flattened to text. A reading view is for reading prose. Losing a link's href is a worse outcome than
 * losing its underline, so links are kept as their own block kind rather than silently dropped.
 */

export type ReaderBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }
  /** `src` is validated to http(s)/data:image before it ever leaves the page. */
  | { kind: 'image'; src: string; alt: string };

export interface ReaderArticle {
  /** The article's own title, which is often better than the tab's `<title>`. */
  title: string;
  /** Byline, when the page states one. Empty when it does not — never guessed. */
  byline: string;
  /** The site the article came from, shown so a reading view never hides its own source. */
  siteName: string;
  blocks: ReaderBlock[];
  /** Words counted from the extracted blocks, for the reading-time estimate. */
  wordCount: number;
}

/** Bounds. The page is untrusted input and every one of these is a cap on what it can make us hold. */
export const READER_LIMITS = {
  /** Blocks kept. A long-read is a few hundred; this is well past any real article. */
  maxBlocks: 2_000,
  /** Characters per text block. */
  maxBlockChars: 20_000,
  /** Items in one list. */
  maxListItems: 500,
  maxTitleChars: 300,
  maxBylineChars: 200,
  maxSrcChars: 4_096,
} as const;

/**
 * Reading time in minutes, rounded up, minimum 1.
 *
 * 200 wpm is the low end of the usual adult range, chosen deliberately: a reader who finishes early is
 * not misled, and one who was told "2 min" for a ten-minute piece is.
 */
export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 200));
}
