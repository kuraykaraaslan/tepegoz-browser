import type { Db } from '@tepegoz/persistence';
import { BOOKMARK_ROOT_OTHER, BookmarkTreeStore } from './bookmark-tree-store';
import { isBookmarkable } from './bookmarkable';
import {
  ImportedBookmarkFolderSchema,
  MAX_DEPTH,
  MAX_FAVICON_CHARS,
  MAX_NODES,
  MAX_TITLE_CHARS,
  MAX_URL_CHARS,
  type ImportedBookmarkFolder,
  type ImportedBookmarkNode,
  type ParsedBookmarks,
} from './bookmark-import-limits';

export type {
  ImportedBookmark,
  ImportedBookmarkFolder,
  ImportedBookmarkNode,
  ParsedBookmarks,
} from './bookmark-import-limits';

export type BrowserImportSource = 'chrome' | 'edge' | 'firefox' | 'brave' | 'other';

export interface BookmarkImportResult {
  imported: number;
  skipped: number;
  folders: number;
  /** True when the file held more than `MAX_NODES` entries and the rest were not read. A partial
   *  import that reports itself as complete is the failure mode this repo keeps finding. */
  truncated: boolean;
  errors: string[];
}


const TOKEN_RE = /<DT>\s*<H3\b[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A\b([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;
/**
 * Parse the Netscape bookmarks HTML format exported by Chromium, Firefox, Edge, and Brave.
 *
 * The caps are applied HERE rather than to the finished tree, because a bound checked after the tree
 * exists is a bound on nothing — the memory has already been spent. Reaching `MAX_NODES` stops the scan
 * and says so; it never silently returns part of a file as if it were the whole one.
 */
export function parseBookmarksHtml(html: string): ParsedBookmarks {
  const root: ImportedBookmarkFolder = { type: 'folder', title: 'root', children: [] };
  const stack: ImportedBookmarkFolder[] = [root];
  let match: RegExpExecArray | null;
  let nodes = 0;
  let truncated = false;

  while ((match = TOKEN_RE.exec(html)) !== null) {
    if (match[1] !== undefined || match[2] !== undefined) {
      if (nodes >= MAX_NODES) {
        truncated = true;
        break;
      }
      nodes++;
    }
    if (match[1] !== undefined) {
      const title = cap(cleanText(match[1]), MAX_TITLE_CHARS) || 'Folder';
      const folder: ImportedBookmarkFolder = { type: 'folder', title, children: [] };
      stack[stack.length - 1]!.children.push(folder);
      if (stack.length < MAX_DEPTH) stack.push(folder);
    } else if (match[2] !== undefined) {
      const url = cap(decodeEntities(attr(match[2], 'href')), MAX_URL_CHARS);
      if (url.length === 0) continue;
      const title = cap(cleanText(match[3] ?? ''), MAX_TITLE_CHARS) || url;
      stack[stack.length - 1]!.children.push({
        type: 'bookmark',
        title,
        url,
        favicon: normalizeIcon(attr(match[2], 'icon') || attr(match[2], 'icon_uri')),
      });
    } else if (stack.length > 1) {
      stack.pop();
    }
  }

  return { root, truncated };
}

/** Truncate rather than reject: an absurdly long title is a malformed file, not a reason to lose the
 *  bookmark it belongs to. */
function cap(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function sourceDisplayName(source: BrowserImportSource): string {
  if (source === 'chrome') return 'Chrome';
  if (source === 'edge') return 'Edge';
  if (source === 'firefox') return 'Firefox';
  if (source === 'brave') return 'Brave';
  return 'Browser';
}

export function importBookmarksHtmlToStore(
  db: Db,
  input: { source: BrowserImportSource; data: string },
): BookmarkImportResult {
  return writeParsedBookmarksToStore(
    db,
    parseBookmarksHtml(input.data),
    `Imported from ${sourceDisplayName(input.source)}`,
  );
}

/**
 * Write what a parser produced into the bookmark tree, under one new folder named `rootTitle`.
 *
 * Every import source shares this: the HTML export path, and the on-disk profile paths (Chromium JSON,
 * Firefox `places.sqlite`). One writer means the boundary `safeParse`, the scheme gate, the duplicate
 * skip and the "create the root folder only if something is actually written" rule cannot drift apart
 * per source — which is exactly how a second import path usually ends up with weaker checks than the
 * first.
 *
 * `parsed === null` is a parser saying "this is not a bookmarks file". It is reported as an error, not
 * as an import that found nothing.
 */
export function writeParsedBookmarksToStore(
  db: Db,
  parsed: ParsedBookmarks | null,
  rootTitle: string,
): BookmarkImportResult {
  const result: BookmarkImportResult = {
    imported: 0,
    skipped: 0,
    folders: 0,
    truncated: parsed?.truncated ?? false,
    errors: [],
  };
  if (parsed === null) {
    result.errors.push('The bookmarks file could not be read.');
    return result;
  }

  // The boundary contract. The parser's own caps are what keep the memory bounded; this is what makes
  // the SHAPE checked rather than assumed, and it is the gate that survives a future edit to the
  // parser. `safeParse`, never `parse`: a malformed file must produce a result the user can read, not
  // an exception thrown out of an IPC handler.
  const checked = ImportedBookmarkFolderSchema.safeParse(parsed.root);
  if (!checked.success) {
    result.errors.push('The bookmarks file could not be read.');
    return result;
  }

  const seen = new Set(BookmarkTreeStore.listFlat(db, 100_000).map((b) => b.url));
  let rootId: string | null = null;
  const ensureRoot = (): string => {
    if (rootId === null) {
      rootId = BookmarkTreeStore.createFolder(db, {
        parentId: BOOKMARK_ROOT_OTHER,
        title: rootTitle,
      });
      result.folders++;
    }
    return rootId;
  };

  for (const node of checked.data.children) {
    writeImportedNode(db, node, ensureRoot, seen, result);
  }
  return result;
}

function writeImportedNode(
  db: Db,
  node: ImportedBookmarkNode,
  parentId: () => string,
  seen: Set<string>,
  result: BookmarkImportResult,
): boolean {
  if (node.type === 'bookmark') {
    const url = node.url.trim();
    if (!isBookmarkable(url) || seen.has(url)) {
      result.skipped++;
      return false;
    }
    BookmarkTreeStore.createBookmark(db, {
      parentId: parentId(),
      title: node.title.trim().length > 0 ? node.title.trim() : url,
      url,
      favicon: node.favicon,
    });
    seen.add(url);
    result.imported++;
    return true;
  }

  let folderId: string | null = null;
  const ensureFolder = (): string => {
    if (folderId === null) {
      folderId = BookmarkTreeStore.createFolder(db, {
        parentId: parentId(),
        title: node.title.trim().length > 0 ? node.title.trim() : 'Folder',
      });
      result.folders++;
    }
    return folderId;
  };

  let wrote = false;
  for (const child of node.children) {
    if (writeImportedNode(db, child, ensureFolder, seen, result)) wrote = true;
  }
  return wrote;
}

function attr(attrs: string, name: string): string {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = re.exec(attrs);
  return decodeEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? '');
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (_all, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos') return "'";
      if (lower === 'nbsp') return ' ';
      const code = lower.startsWith('#x')
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      // `String.fromCodePoint` THROWS a RangeError above U+10FFFF, so `&#99999999;` anywhere in an
      // untrusted file — a title, a URL, an attribute — took the whole import down. `Number.isFinite`
      // does not catch it: 99999999 is perfectly finite. Lone surrogates are refused for a different
      // reason — `fromCodePoint` accepts them, and they produce ill-formed UTF-16 that then goes into
      // SQLite and back out into the UI.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
      if (code >= 0xd800 && code <= 0xdfff) return '';
      return String.fromCodePoint(code);
    },
  );
}

function normalizeIcon(icon: string): string | null {
  const trimmed = icon.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_FAVICON_CHARS) return null;
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
  return null;
}
