import type { Db } from '@tepegoz/persistence';
import { BOOKMARK_ROOT_OTHER, BookmarkTreeStore } from './bookmark-tree-store';
import { isBookmarkable } from './bookmarkable';

export type BrowserImportSource = 'chrome' | 'edge' | 'firefox' | 'brave' | 'other';

export interface ImportedBookmark {
  type: 'bookmark';
  title: string;
  url: string;
  favicon: string | null;
}

export interface ImportedBookmarkFolder {
  type: 'folder';
  title: string;
  children: ImportedBookmarkNode[];
}

export type ImportedBookmarkNode = ImportedBookmark | ImportedBookmarkFolder;

export interface BookmarkImportResult {
  imported: number;
  skipped: number;
  folders: number;
  errors: string[];
}

const TOKEN_RE = /<DT>\s*<H3\b[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A\b([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;
const MAX_DEPTH = 64;

/** Parse the Netscape bookmarks HTML format exported by Chromium, Firefox, Edge, and Brave. */
export function parseBookmarksHtml(html: string): ImportedBookmarkFolder {
  const root: ImportedBookmarkFolder = { type: 'folder', title: 'root', children: [] };
  const stack: ImportedBookmarkFolder[] = [root];
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(html)) !== null) {
    if (match[1] !== undefined) {
      const title = cleanText(match[1]) || 'Folder';
      const folder: ImportedBookmarkFolder = { type: 'folder', title, children: [] };
      stack[stack.length - 1]!.children.push(folder);
      if (stack.length < MAX_DEPTH) stack.push(folder);
    } else if (match[2] !== undefined) {
      const url = attr(match[2], 'href');
      if (url.length === 0) continue;
      const title = cleanText(match[3] ?? '') || url;
      stack[stack.length - 1]!.children.push({
        type: 'bookmark',
        title,
        url: decodeEntities(url),
        favicon: normalizeIcon(attr(match[2], 'icon') || attr(match[2], 'icon_uri')),
      });
    } else if (stack.length > 1) {
      stack.pop();
    }
  }

  return root;
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
  const parsed = parseBookmarksHtml(input.data);
  const seen = new Set(BookmarkTreeStore.listFlat(db, 100_000).map((b) => b.url));
  const result: BookmarkImportResult = { imported: 0, skipped: 0, folders: 0, errors: [] };
  let rootId: string | null = null;
  const rootTitle = `Imported from ${sourceDisplayName(input.source)}`;
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

  for (const node of parsed.children) {
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
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    },
  );
}

function normalizeIcon(icon: string): string | null {
  const trimmed = icon.trim();
  if (trimmed.length === 0 || trimmed.length > 100_000) return null;
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
  return null;
}
