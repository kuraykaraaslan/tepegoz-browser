import {
  MAX_DEPTH,
  MAX_NODES,
  MAX_TITLE_CHARS,
  MAX_URL_CHARS,
  type ImportedBookmarkFolder,
  type ParsedBookmarks,
} from './bookmark-import-limits';

/**
 * Firefox's `places.sqlite`, turned into the same tree every other import source produces.
 *
 * The rows are passed IN rather than read here, so the shape logic — root selection, ordering, the tags
 * root, separators, smart folders, cycles — is testable without a SQLite file on disk. The file access
 * that produces them lives in `browser-profile-read.ts`, which is the only part that needs a real DB.
 */

/** One `moz_bookmarks` row joined to its `moz_places` URL. */
export interface FirefoxBookmarkRow {
  id: number;
  parent: number;
  /** Firefox's own type enum: 1 = bookmark, 2 = folder, 3 = separator. */
  type: number;
  title: string | null;
  position: number;
  guid: string | null;
  url: string | null;
}

/**
 * The query that produces exactly the rows above. Kept beside the reader that consumes them.
 *
 * The `LIMIT` is not a nicety: `places.sqlite` belongs to another application and can be any size, and
 * `all()` materializes every row it returns. Four times the node cap leaves room for the folders and
 * separators that do not become nodes, while keeping a hostile or damaged file bounded.
 */
export const FIREFOX_PLACES_ROW_LIMIT = MAX_NODES * 4;
export const FIREFOX_PLACES_QUERY = `
  SELECT b.id AS id, b.parent AS parent, b.type AS type, b.title AS title,
         b.position AS position, b.guid AS guid, p.url AS url
  FROM moz_bookmarks b
  LEFT JOIN moz_places p ON p.id = b.fk
  ORDER BY b.parent, b.position
  LIMIT ${FIREFOX_PLACES_ROW_LIMIT}
`;

const PLACES_ROOT_ID = 1;
/**
 * The tags root is skipped. Its children are not folders of bookmarks — they are tag containers whose
 * own children are pointers back to bookmarks that already appear under the real roots. Importing it
 * would duplicate every tagged bookmark once per tag, which is how a "successful" import produces a
 * bookmark tree the user did not have. Matched by guid first (stable across Firefox versions) with the
 * historical id as the fallback for very old profiles.
 */
const TAGS_ROOT_GUID = 'tags________';
const TAGS_ROOT_ID = 4;

const TYPE_BOOKMARK = 1;
const TYPE_FOLDER = 2;

export function buildFirefoxBookmarkTree(rows: readonly FirefoxBookmarkRow[]): ParsedBookmarks {
  const byParent = new Map<number, FirefoxBookmarkRow[]>();
  for (const row of rows) {
    if (row.guid === TAGS_ROOT_GUID || row.id === TAGS_ROOT_ID) continue;
    const siblings = byParent.get(row.parent);
    if (siblings === undefined) byParent.set(row.parent, [row]);
    else siblings.push(row);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.position - b.position);

  const root: ImportedBookmarkFolder = { type: 'folder', title: 'root', children: [] };
  const budget = { nodes: 0, truncated: false };
  // A `parent` column is just an integer: a corrupt or hand-edited profile can point a folder at its
  // own descendant. Without this the walk never returns.
  const visited = new Set<number>([PLACES_ROOT_ID]);
  walk(PLACES_ROOT_ID, root, 1, byParent, visited, budget);
  return { root, truncated: budget.truncated };
}

function walk(
  parentId: number,
  parent: ImportedBookmarkFolder,
  depth: number,
  byParent: Map<number, FirefoxBookmarkRow[]>,
  visited: Set<number>,
  budget: { nodes: number; truncated: boolean },
): void {
  for (const row of byParent.get(parentId) ?? []) {
    if (budget.truncated) return;
    if (row.type !== TYPE_BOOKMARK && row.type !== TYPE_FOLDER) continue; // separators
    if (budget.nodes >= MAX_NODES) {
      budget.truncated = true;
      return;
    }
    budget.nodes++;

    if (row.type === TYPE_BOOKMARK) {
      const url = cap(row.url ?? '', MAX_URL_CHARS);
      // `place:` is a saved QUERY (Firefox's "Most Visited", "Recent Tags"), not a page. It would be
      // rejected by the scheme gate at write time anyway; dropping it here keeps it out of the skipped
      // count, where it would read as data the import lost.
      if (url.length === 0 || url.toLowerCase().startsWith('place:')) continue;
      parent.children.push({
        type: 'bookmark',
        title: cap(row.title ?? '', MAX_TITLE_CHARS) || url,
        url,
        // places.sqlite does not carry the icon; favicons.sqlite does, and it is a separate file whose
        // schema changes between versions. Null, refetched on first visit.
        favicon: null,
      });
      continue;
    }

    if (visited.has(row.id)) continue;
    visited.add(row.id);
    if (depth >= MAX_DEPTH) {
      walk(row.id, parent, depth, byParent, visited, budget);
      continue;
    }
    const folder: ImportedBookmarkFolder = {
      type: 'folder',
      title: cap(row.title ?? '', MAX_TITLE_CHARS) || 'Folder',
      children: [],
    };
    parent.children.push(folder);
    walk(row.id, folder, depth + 1, byParent, visited, budget);
  }
}

function cap(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}
