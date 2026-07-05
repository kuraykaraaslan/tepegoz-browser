import { defaultUrlTransform } from 'react-markdown';
import { FILE_LINK_SCHEME } from './remark-file-links';

/**
 * URL sanitizer for `<ReactMarkdown urlTransform>`. react-markdown's built-in `defaultUrlTransform`
 * strips any href whose scheme isn't in its safe list (http/https/mailto/…), which would blank our
 * internal `tepegoz-file:` links before the `a` renderer runs (making the file-open feature dead).
 * Preserve ONLY that scheme — the `a` renderer never emits it as a navigable href (it renders `#` and
 * carries the path via the click closure) — and delegate everything else to the default, so
 * `javascript:` / `data:` and other unsafe schemes stay stripped to ''.
 */
export function fileUrlTransform(url: string): string {
  return url.startsWith(FILE_LINK_SCHEME) ? url : defaultUrlTransform(url);
}
