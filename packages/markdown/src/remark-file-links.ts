/**
 * A tiny remark (mdast) plugin that turns absolute filesystem paths appearing in prose into clickable
 * links, so the agent's "saved to C:\Users\…\notes.txt" summary becomes an openable link. Detected paths
 * are rewritten to `link` nodes with a {@link FILE_LINK_SCHEME} url; the Markdown component's `a` renderer
 * recognizes that scheme and routes the click to a host handler (which opens the file, gated to the
 * user's whitelisted folders). Text inside code / inline-code is never touched (those are not `text`
 * nodes), and existing links are left alone.
 */

/** URL scheme marking a local file to open. The value after the colon is the raw absolute path. */
export const FILE_LINK_SCHEME = 'tepegoz-file:';

/** Minimal mdast node shape (avoids a dependency on @types/mdast). */
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  [key: string]: unknown;
}

// Windows drive path (`X:\a\b`) OR a POSIX absolute path with at least two segments (`/a/b`), stopping at
// whitespace or shell/quote punctuation. The two-segment minimum avoids matching a lone `/word`.
const PATH_RE = /(?:[A-Za-z]:\\[^\s"'<>|]+|\/(?:[^\s/"'<>|]+\/)+[^\s/"'<>|]+)/g;
/** Trailing sentence punctuation to exclude from the matched path (e.g. "saved to /a/b.txt."). */
const TRAILING = /[).,;:]+$/;

/** Split a text value into text/link nodes, linkifying absolute file paths. Null when no path is found. */
export function linkifyText(value: string): MdNode[] | null {
  PATH_RE.lastIndex = 0;
  const out: MdNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_RE.exec(value)) !== null) {
    let path = match[0];
    let end = match.index + path.length;
    const trailing = TRAILING.exec(path);
    if (trailing !== null) {
      path = path.slice(0, path.length - trailing[0].length);
      end -= trailing[0].length;
    }
    if (path.length === 0) continue;
    if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) });
    out.push({
      type: 'link',
      url: FILE_LINK_SCHEME + path,
      children: [{ type: 'text', value: path }],
    });
    last = end;
  }
  if (out.length === 0) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function transform(node: MdNode): void {
  if (!Array.isArray(node.children)) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const parts = linkifyText(child.value);
      if (parts !== null) {
        next.push(...parts);
        continue;
      }
    } else {
      transform(child);
    }
    next.push(child);
  }
  node.children = next;
}

/** remark plugin factory. Usage: `remarkPlugins={[remarkFileLinks]}`. */
export function remarkFileLinks(): (tree: MdNode) => void {
  return (tree: MdNode): void => {
    transform(tree);
  };
}
