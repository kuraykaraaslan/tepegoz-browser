import type { BookmarkTreeNode } from './bookmark-tree-store';

/**
 * Serialize the bookmark tree to the Netscape bookmarks HTML format.
 *
 * This existed only in the import direction, which meant a user could bring bookmarks in and could not
 * get them out. For a local-first browser that is not a missing convenience — the whole promise of
 * local-first is that the data is yours, and data you cannot remove from the application is not yours
 * in any sense that matters. It is also the format every other browser reads, so the export doubles as
 * the exit path.
 *
 * Netscape HTML rather than JSON for exactly that reason: a JSON dump would be a backup only this
 * application can restore, which is the shape of lock-in that looks like a feature.
 *
 * The parser in `bookmark-import.ts` reads what this writes, so the round trip is checkable rather than
 * asserted — see `bookmark-export.test.ts`, which imports its own output and compares trees.
 */

const HEADER = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
`;

/**
 * Escape for HTML text and for a double-quoted attribute.
 *
 * `&` first, or every entity written afterwards gets its own ampersand escaped a second time. Both `<`
 * and `"` matter here: a bookmark titled `<script>` must not become markup in a file the user is very
 * likely to open in a browser, and a URL containing a quote must not break out of its `HREF="…"`.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Seconds, the unit the Netscape format uses for ADD_DATE/LAST_MODIFIED (the ms in our rows are ours). */
function seconds(ms: number): string {
  return String(Math.floor(ms / 1000));
}

function serializeNodes(nodes: readonly BookmarkTreeNode[], depth: number): string {
  const pad = '    '.repeat(depth);
  let out = `${pad}<DL><p>\n`;
  for (const node of nodes) {
    const title = escapeHtml(node.title);
    if (node.type === 'folder') {
      out += `${pad}    <DT><H3 ADD_DATE="${seconds(node.createdAt)}" LAST_MODIFIED="${seconds(node.updatedAt)}">${title}</H3>\n`;
      out += serializeNodes(node.children, depth + 1);
      continue;
    }
    if (node.url === null) continue;
    // The favicon is written as ICON="…" — the same attribute the parser reads — so a data: URI
    // survives a round trip instead of being silently dropped and re-fetched from the network later.
    const icon = node.favicon === null ? '' : ` ICON="${escapeHtml(node.favicon)}"`;
    out += `${pad}    <DT><A HREF="${escapeHtml(node.url)}" ADD_DATE="${seconds(node.createdAt)}"${icon}>${title}</A>\n`;
  }
  out += `${pad}</DL><p>\n`;
  return out;
}

/** The complete file contents for a bookmarks export. */
export function serializeBookmarksHtml(roots: readonly BookmarkTreeNode[]): string {
  return HEADER + serializeNodes(roots, 0);
}
