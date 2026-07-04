import type { Db } from '@tepegoz/persistence';

// This module is reachable from the sandboxed RENDERER (it re-exports `isBookmarkable`), so it must not
// statically import any `node:*` builtin — that would pull Node-only code into the renderer bundle and
// crash it on load. `crypto.randomUUID()` is a global in both Electron's Node and the renderer, and the
// mutation methods that call it only ever run in the main process anyway.
const randomUUID = (): string => crypto.randomUUID();

/** Fixed root-folder ids (Chrome parity: two roots). Seeded by persistence migration v6. */
export const BOOKMARK_ROOT_BAR = 'root-bar';
export const BOOKMARK_ROOT_OTHER = 'root-other';
/** The two roots, in display order (bar first). Neither may be moved, renamed away, or deleted. */
export const BOOKMARK_ROOT_IDS = [BOOKMARK_ROOT_BAR, BOOKMARK_ROOT_OTHER] as const;
/** Gap between sibling `position` ranks. Siblings are renumbered 0,GAP,2·GAP,… on every structural write. */
const POSITION_GAP = 1000;

export type BookmarkNodeType = 'folder' | 'bookmark';

/** A tree node — a folder (`url` null) or a bookmark (`url` set). `ts` mirrors `updatedAt` for legacy DTOs. */
export interface BookmarkNode {
  id: string;
  parentId: string | null;
  type: BookmarkNodeType;
  title: string;
  url: string | null;
  /** Favicon URL (http(s)/data:) captured when the bookmark was saved; null for folders / not-yet-saved. */
  favicon: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/** A node with its (ordered) children materialized — the shape the bar and manager render. */
export interface BookmarkTreeNode extends BookmarkNode {
  children: BookmarkTreeNode[];
}

/** Flat bookmark DTO for the omnibox + legacy `bookmarks:list` (folders excluded). */
export interface BookmarkEntry {
  url: string;
  title: string;
  /** Favicon URL (http(s)/data:) captured at save time, or null. */
  favicon: string | null;
  /** Epoch ms (the bookmark's updated_at). */
  ts: number;
}

interface NodeRow {
  id: string;
  parent_id: string | null;
  node_type: BookmarkNodeType;
  title: string;
  url: string | null;
  favicon: string | null;
  position: number;
  created_at: number;
  updated_at: number;
}

function toNode(row: NodeRow): BookmarkNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.node_type,
    title: row.title,
    url: row.url,
    favicon: row.favicon,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isRoot(id: string): boolean {
  return (BOOKMARK_ROOT_IDS as readonly string[]).includes(id);
}

/**
 * Bookmark tree (L1). Folders + bookmarks in one self-referential table (`bookmark_nodes`), ordered by a
 * sparse `position` within each parent. Reads are trusted DB output; the untrusted boundary (renderer
 * mutations) is validated at the IPC layer. Recursive delete is handled by the FK `ON DELETE CASCADE`.
 *
 * Ordering: every structural write renumbers the affected parent's children to 0,GAP,2·GAP,… — trees are
 * small (hundreds of nodes) so this is trivial and sidesteps rank-collision math entirely.
 */
export class BookmarkTreeStore {
  private static childRows(db: Db, parentId: string): NodeRow[] {
    return db
      .prepare(
        `SELECT id, parent_id, node_type, title, url, favicon, position, created_at, updated_at
         FROM bookmark_nodes WHERE parent_id = ? ORDER BY position, id`,
      )
      .all(parentId) as NodeRow[];
  }

  /** Renumber the given ordered ids to 0,GAP,2·GAP,… (their parent is assumed already set). Reordering
   *  is purely positional — it must NOT touch `updated_at` (that would make a sibling reorder look like a
   *  content edit and scramble `listFlat`'s newest-first order). */
  private static renumber(db: Db, orderedIds: string[]): void {
    const stmt = db.prepare('UPDATE bookmark_nodes SET position = ? WHERE id = ?');
    orderedIds.forEach((id, i) => stmt.run(i * POSITION_GAP, id));
  }

  private static insert(
    db: Db,
    node: {
      parentId: string;
      type: BookmarkNodeType;
      title: string;
      url: string | null;
      favicon?: string | null;
      index?: number;
    },
  ): string {
    const now = Date.now();
    const id = randomUUID();
    const siblings = BookmarkTreeStore.childRows(db, node.parentId).map((r) => r.id);
    const at = node.index === undefined ? siblings.length : Math.max(0, Math.min(node.index, siblings.length));
    const order = [...siblings.slice(0, at), id, ...siblings.slice(at)];
    const run = db.transaction(() => {
      db.prepare(
        `INSERT INTO bookmark_nodes (id, parent_id, node_type, title, url, favicon, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, node.parentId, node.type, node.title, node.url, node.favicon ?? null, at * POSITION_GAP, now, now);
      BookmarkTreeStore.renumber(db, order);
    });
    run();
    return id;
  }

  static createFolder(db: Db, input: { parentId: string; title: string; index?: number }): string {
    return BookmarkTreeStore.insert(db, { ...input, type: 'folder', url: null });
  }

  static createBookmark(
    db: Db,
    input: { parentId: string; title: string; url: string; favicon?: string | null; index?: number },
  ): string {
    return BookmarkTreeStore.insert(db, { ...input, type: 'bookmark' });
  }

  static rename(db: Db, id: string, title: string): void {
    db.prepare('UPDATE bookmark_nodes SET title = ?, updated_at = ? WHERE id = ?').run(
      title,
      Date.now(),
      id,
    );
  }

  static setUrl(db: Db, id: string, url: string): void {
    db.prepare(
      `UPDATE bookmark_nodes SET url = ?, updated_at = ? WHERE id = ? AND node_type = 'bookmark'`,
    ).run(url, Date.now(), id);
  }

  /** Recursive delete (children cascade via FK). Refuses the two fixed roots. */
  static remove(db: Db, id: string): void {
    if (isRoot(id)) return;
    db.prepare('DELETE FROM bookmark_nodes WHERE id = ?').run(id);
  }

  /** Is `ancestorId` an ancestor of (or equal to) `id`? Walks parent links up from `id`. */
  private static isAncestorOf(db: Db, ancestorId: string, id: string): boolean {
    const parentOf = db.prepare('SELECT parent_id AS p FROM bookmark_nodes WHERE id = ?');
    let cur: string | null = id;
    while (cur !== null) {
      if (cur === ancestorId) return true;
      const row = parentOf.get(cur) as { p: string | null } | undefined;
      cur = row?.p ?? null;
    }
    return false;
  }

  /** Reparent + reorder `id` to `index` within `newParentId`. Cycle-guarded; refuses moving a root. */
  static move(db: Db, id: string, newParentId: string, index: number): void {
    if (isRoot(id) || id === newParentId) return;
    const target = BookmarkTreeStore.getNode(db, newParentId);
    if (target === null || target.type !== 'folder') return; // can only nest under a folder
    // Reject moving a folder into itself or one of its own descendants (would corrupt the tree).
    if (BookmarkTreeStore.isAncestorOf(db, id, newParentId)) return;

    const now = Date.now();
    const siblings = BookmarkTreeStore.childRows(db, newParentId)
      .map((r) => r.id)
      .filter((sid) => sid !== id);
    const at = Math.max(0, Math.min(index, siblings.length));
    const order = [...siblings.slice(0, at), id, ...siblings.slice(at)];
    const run = db.transaction(() => {
      db.prepare('UPDATE bookmark_nodes SET parent_id = ?, updated_at = ? WHERE id = ?').run(
        newParentId,
        now,
        id,
      );
      BookmarkTreeStore.renumber(db, order);
    });
    run();
  }

  static getNode(db: Db, id: string): BookmarkNode | null {
    const row = db
      .prepare(
        `SELECT id, parent_id, node_type, title, url, favicon, position, created_at, updated_at
         FROM bookmark_nodes WHERE id = ?`,
      )
      .get(id) as NodeRow | undefined;
    return row === undefined ? null : toNode(row);
  }

  /** Direct children of `parentId`, ordered. */
  static listChildren(db: Db, parentId: string): BookmarkNode[] {
    return BookmarkTreeStore.childRows(db, parentId).map(toNode);
  }

  /** The subtree rooted at `rootId` (children materialized recursively), or null if it doesn't exist. */
  static getSubtree(db: Db, rootId: string): BookmarkTreeNode | null {
    const node = BookmarkTreeStore.getNode(db, rootId);
    if (node === null) return null;
    const build = (n: BookmarkNode): BookmarkTreeNode => ({
      ...n,
      children: BookmarkTreeStore.childRows(db, n.id).map((r) => build(toNode(r))),
    });
    return build(node);
  }

  /** The full forest the manager renders: [Bookmarks bar, Other bookmarks]. */
  static getTree(db: Db): BookmarkTreeNode[] {
    return BOOKMARK_ROOT_IDS.map((id) => BookmarkTreeStore.getSubtree(db, id)).filter(
      (n): n is BookmarkTreeNode => n !== null,
    );
  }

  /** All bookmark nodes (not folders) pointing at `url` — duplicates across folders are allowed. */
  static findByUrl(db: Db, url: string): BookmarkNode[] {
    return (
      db
        .prepare(
          `SELECT id, parent_id, node_type, title, url, favicon, position, created_at, updated_at
           FROM bookmark_nodes WHERE node_type = 'bookmark' AND url = ?`,
        )
        .all(url) as NodeRow[]
    ).map(toNode);
  }

  static isBookmarkedAnywhere(db: Db, url: string): boolean {
    const row = db
      .prepare(`SELECT 1 FROM bookmark_nodes WHERE node_type = 'bookmark' AND url = ? LIMIT 1`)
      .get(url);
    return row !== undefined;
  }

  /**
   * Star toggle: if `url` is bookmarked anywhere, remove EVERY instance and return false; otherwise add
   * it to the Bookmarks-bar root and return true. Keeps the one-per-URL star contract despite the tree
   * allowing duplicates via the manager.
   */
  static toggleAtBar(db: Db, url: string, title: string, favicon?: string | null): boolean {
    if (BookmarkTreeStore.isBookmarkedAnywhere(db, url)) {
      db.prepare(`DELETE FROM bookmark_nodes WHERE node_type = 'bookmark' AND url = ?`).run(url);
      return false;
    }
    BookmarkTreeStore.createBookmark(db, {
      parentId: BOOKMARK_ROOT_BAR,
      title: title.trim().length > 0 ? title : url,
      url,
      favicon: favicon ?? null,
    });
    return true;
  }

  /** Flat, newest-first bookmark list (folders excluded) — omnibox + legacy `bookmarks:list`. */
  static listFlat(db: Db, limit = 500): BookmarkEntry[] {
    return db
      .prepare(
        `SELECT url, title, favicon, updated_at AS ts FROM bookmark_nodes
         WHERE node_type = 'bookmark' AND url IS NOT NULL
         ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      )
      .all(limit) as BookmarkEntry[];
  }

  static search(db: Db, query: string, limit = 500): BookmarkEntry[] {
    const like = `%${query}%`;
    return db
      .prepare(
        `SELECT url, title, favicon, updated_at AS ts FROM bookmark_nodes
         WHERE node_type = 'bookmark' AND url IS NOT NULL AND (url LIKE ? OR title LIKE ?)
         ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      )
      .all(like, like, limit) as BookmarkEntry[];
  }
}
