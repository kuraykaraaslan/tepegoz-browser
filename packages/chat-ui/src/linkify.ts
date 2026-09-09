/**
 * Split message text into plain runs and safe hyperlink runs.
 *
 * "Safe" is the whole point: the timeline renders a `link` segment as an anchor the user can click,
 * but the extension never *navigates on its own* and never fetches a URL for a preview. Only
 * `http:`/`https:` absolute URLs are recognised — `javascript:`, `data:`, `file:` and bare hosts are
 * left as text, so a crafted message body cannot smuggle a scheme the renderer would act on.
 */

export type LinkSegment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'link'; readonly value: string; readonly href: string };

/** Guard against a pathological body producing an unbounded segment list for the renderer. */
export const MAX_LINK_SEGMENTS = 512;

// http(s) scheme, then any run of non-space / non-bracket chars. Trailing punctuation is trimmed
// below so "see https://x.org." does not capture the full stop.
const URL_RE = /\bhttps?:\/\/[^\s<>[\]()]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:'")\]}]+$/;

function splitTrailingPunctuation(match: string): { url: string; rest: string } {
  const trimmed = TRAILING_PUNCTUATION.exec(match);
  if (trimmed === null) return { url: match, rest: '' };
  const cut = match.length - trimmed[0].length;
  return { url: match.slice(0, cut), rest: match.slice(cut) };
}

export function linkifySegments(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (segments.length >= MAX_LINK_SEGMENTS - 1) break;
    const { url, rest } = splitTrailingPunctuation(match[0]);
    if (url.length <= 'https://'.length) continue;

    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: 'link', value: url, href: url });
    lastIndex = match.index + url.length;
    if (rest.length > 0) {
      // Re-scan from the punctuation so it becomes part of the following text run.
      URL_RE.lastIndex = lastIndex;
    }
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
