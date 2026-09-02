import type { Db } from '@tepegoz/persistence';
// Node-free subpath — never the package barrel, which pulls `node:sqlite` into the renderer bundle.
import { likeContains } from '@tepegoz/persistence/sql-like';
import { MetaStore } from '@tepegoz/persistence';
import { foldForSearch } from '@tepegoz/i18n';
import { normalizeTags } from './bookmark-tags';

// This module is reachable from the sandboxed RENDERER (it re-exports `isBookmarkable`), so it must not
// statically import any `node:*` builtin — that would pull Node-only code into the renderer bundle and
// crash it on load. `crypto.randomUUID()` is a global in both Electron's Node and the renderer, and the
// mutation methods that call it only ever run in the main process anyway.
const randomUUID = (): string => crypto.randomUUID();

/** Fixed root-folder ids (Chrome parity: two roots). Seeded by persistence migration v6. */
/**
 * Bump when {@link foldForSearch}'s output changes, so {@link BookmarkTreeStore.reindexFoldsIfStale}
 * re-folds stored rows instead of leaving a search index built by a previous rule. v1 = the initial
 * `title_fold` / `url_fold` / `tag_fold` shadow columns (migration 17).
 */
export const BOOKMARK_FOLD_VERSION = 1;
const FOLD_VERSION_META_KEY = 'bookmark_fold_version';

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
  /**
   * Free-form labels on a bookmark, beside the folder it lives in. Always present, empty for folders
   * and for untagged bookmarks, so a caller never has to distinguish "no tags" from "not loaded".
   *
   * Only populated by the tree reads (`getTree`/`getSubtree`), which fetch every tag in one query
   * rather than one per node — a manager rendering a few thousand bookmarks must not issue a few
   * thousand statements.
   */
  tags: string[];
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
    tags: [],
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
    const at =
      node.index === undefined
        ? siblings.length
        : Math.max(0, Math.min(node.index, siblings.length));
    const order = [...siblings.slice(0, at), id, ...siblings.slice(at)];
    const run = db.transaction(() => {
      db.prepare(
        `INSERT INTO bookmark_nodes (id, parent_id, node_type, title, url, favicon, position, created_at, updated_at, title_fold, url_fold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        node.parentId,
        node.type,
        node.title,
        node.url,
        node.favicon ?? null,
        at * POSITION_GAP,
        now,
        now,
        foldForSearch(node.title),
        node.url === null ? '' : foldForSearch(node.url),
      );
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
    input: {
      parentId: string;
      title: string;
      url: string;
      favicon?: string | null;
      index?: number;
    },
  ): string {
    return BookmarkTreeStore.insert(db, { ...input, type: 'bookmark' });
  }

  static rename(db: Db, id: string, title: string): void {
    db.prepare(
      'UPDATE bookmark_nodes SET title = ?, title_fold = ?, updated_at = ? WHERE id = ?',
    ).run(title, foldForSearch(title), Date.now(), id);
  }

  static setUrl(db: Db, id: string, url: string): void {
    db.prepare(
      `UPDATE bookmark_nodes SET url = ?, url_fold = ?, updated_at = ? WHERE id = ? AND node_type = 'bookmark'`,
    ).run(url, foldForSearch(url), Date.now(), id);
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
    // One query for every tag in the store, then a lookup per node. The alternative — a query per
    // node — is the shape that makes a bookmark manager slow on exactly the libraries worth managing.
    const tags = BookmarkTreeStore.tagsByNode(db);
    const build = (n: BookmarkNode): BookmarkTreeNode => ({
      ...n,
      tags: tags.get(n.id) ?? [],
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

  /**
   * Search url, title AND tags. Tags are included because a user who took the trouble to tag a page
   * expects the tag to find it — a search that ignored them would make tagging a filing habit with no
   * payoff.
   *
   * Tag matching is on the folded key against the folded query, so searching "work" finds a bookmark
   * tagged "Work". DISTINCT because a bookmark matching on both its title and two of its tags is still
   * one result.
   */
  static search(db: Db, query: string, limit = 500): BookmarkEntry[] {
    // Matched against the case-FOLDED shadow columns, never the raw text: SQLite's LIKE folds ASCII
    // only, so "İSTANBUL Gezisi" was unreachable by typing `istanbul` and "ISPARTA" by typing
    // `ısparta` — both ordinary words in this product's primary market, and both failing as an empty
    // result list rather than an error, which reads as "you have no such bookmark".
    //
    // `likeContains` escapes `%` / `_` so a query of "_" or "%" matches literally, not every bookmark
    // (omnibox track § A3); each `LIKE ?` is paired with `ESCAPE '\'`. Folding happens BEFORE the
    // escaping, because the fold can only remove combining marks, never introduce a wildcard.
    const like = likeContains(foldForSearch(query));
    return db
      .prepare(
        `SELECT DISTINCT n.url AS url, n.title AS title, n.favicon AS favicon, n.updated_at AS ts
         FROM bookmark_nodes n LEFT JOIN bookmark_tags t ON t.node_id = n.id
         WHERE n.node_type = 'bookmark' AND n.url IS NOT NULL
           AND (n.url_fold LIKE ? ESCAPE '\\' OR n.title_fold LIKE ? ESCAPE '\\'
                OR t.tag_fold LIKE ? ESCAPE '\\')
         ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?`,
      )
      .all(like, like, like, limit) as BookmarkEntry[];
  }

  /**
   * Re-fold every searchable column when the stored fold version does not match
   * {@link BOOKMARK_FOLD_VERSION}. One code path for two cases, mirroring
   * `HistoryStore.reindexFoldsIfStale`: the initial backfill of rows written before migration 17 (the
   * meta key is then unset), and a re-fold after {@link foldForSearch}'s rule changes. Idempotent —
   * a matching marker makes it a no-op. Returns the number of rows refolded. Call once at startup,
   * right after `migrate`.
   */
  static reindexFoldsIfStale(db: Db): number {
    if (MetaStore.get(db, FOLD_VERSION_META_KEY) === String(BOOKMARK_FOLD_VERSION)) return 0;
    const nodes = db.prepare('SELECT id, title, url FROM bookmark_nodes').all() as {
      id: string;
      title: string;
      url: string | null;
    }[];
    const tags = db.prepare('SELECT rowid AS rid, tag FROM bookmark_tags').all() as {
      rid: number;
      tag: string;
    }[];
    const updateNode = db.prepare(
      'UPDATE bookmark_nodes SET title_fold = ?, url_fold = ? WHERE id = ?',
    );
    const updateTag = db.prepare('UPDATE bookmark_tags SET tag_fold = ? WHERE rowid = ?');
    db.transaction(() => {
      for (const n of nodes) {
        updateNode.run(foldForSearch(n.title), n.url === null ? '' : foldForSearch(n.url), n.id);
      }
      for (const t of tags) updateTag.run(foldForSearch(t.tag), t.rid);
      MetaStore.set(db, FOLD_VERSION_META_KEY, String(BOOKMARK_FOLD_VERSION));
    })();
    return nodes.length + tags.length;
  }

  // ── Tags ──────────────────────────────────────────────────────────────────────────────────────
  //
  // Tags sit beside the folder hierarchy rather than inside it, which is the point of having both: a
  // bookmark lives in exactly one folder and carries any number of tags, so the two answer different
  // questions ("where did I file this" vs "what is this about") instead of competing.

  /**
   * Replace a bookmark's tags with `tags`. Returns the stored display forms, in order.
   *
   * Replace rather than merge: the UI edits a whole tag line, and a merge-only API gives no way to
   * REMOVE a tag, which is the operation people reach for the moment they mistype one.
   *
   * Folders are refused. A tag on a folder would be a second, weaker way to group things next to the
   * folder itself, and two grouping mechanisms on one node is how a bookmark manager becomes
   * unexplainable.
   */
  static setTags(db: Db, nodeId: string, tags: readonly string[]): string[] {
    const row = db.prepare(`SELECT node_type FROM bookmark_nodes WHERE id = ?`).get(nodeId) as
      { node_type: string } | undefined;
    if (row === undefined || row.node_type !== 'bookmark') return [];

    const normalized = normalizeTags(tags);
    const write = db.transaction(() => {
      db.prepare('DELETE FROM bookmark_tags WHERE node_id = ?').run(nodeId);
      const stmt = db.prepare(
        'INSERT INTO bookmark_tags (node_id, tag, tag_key, tag_fold) VALUES (?, ?, ?, ?)',
      );
      for (const t of normalized) stmt.run(nodeId, t.tag, t.key, foldForSearch(t.tag));
      db.prepare('UPDATE bookmark_nodes SET updated_at = ? WHERE id = ?').run(Date.now(), nodeId);
    });
    write();
    return normalized.map((t) => t.tag);
  }

  /** One bookmark's tags, alphabetically by fold so the order does not depend on insertion. */
  static tagsOf(db: Db, nodeId: string): string[] {
    return (
      db
        .prepare('SELECT tag FROM bookmark_tags WHERE node_id = ? ORDER BY tag_key')
        .all(nodeId) as { tag: string }[]
    ).map((r) => r.tag);
  }

  /**
   * Every tag in use, with how many bookmarks carry it — the tag sidebar's data.
   *
   * `MIN(tag)` picks one display spelling for a tag written more than one way across bookmarks. An
   * arbitrary-but-stable choice beats showing the same tag twice in a list whose whole job is to be
   * the canonical set.
   */
  static listTags(db: Db, limit = 500): { tag: string; count: number }[] {
    const n = Math.max(0, Math.min(Math.trunc(limit), 5000));
    return db
      .prepare(
        `SELECT MIN(tag) AS tag, COUNT(*) AS count FROM bookmark_tags
         GROUP BY tag_key ORDER BY count DESC, tag_key ASC LIMIT ?`,
      )
      .all(n) as { tag: string; count: number }[];
  }

  /** Bookmarks carrying `tag` (matched on the folded key, so case does not matter to the caller). */
  static searchByTag(db: Db, tag: string, limit = 500): BookmarkEntry[] {
    const [normalized] = normalizeTags([tag]);
    if (normalized === undefined) return [];
    const n = Math.max(0, Math.min(Math.trunc(limit), 5000));
    return db
      .prepare(
        `SELECT n.url AS url, n.title AS title, n.favicon AS favicon, n.updated_at AS ts
         FROM bookmark_nodes n JOIN bookmark_tags t ON t.node_id = n.id
         WHERE t.tag_key = ? AND n.node_type = 'bookmark' AND n.url IS NOT NULL
         ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?`,
      )
      .all(normalized.key, n) as BookmarkEntry[];
  }

  /** Tags for many bookmarks at once, so rendering a tree is one query rather than one per node. */
  static tagsByNode(db: Db): Map<string, string[]> {
    const rows = db.prepare('SELECT node_id, tag FROM bookmark_tags ORDER BY tag_key').all() as {
      node_id: string;
      tag: string;
    }[];
    const out = new Map<string, string[]>();
    for (const r of rows) {
      const list = out.get(r.node_id);
      if (list === undefined) out.set(r.node_id, [r.tag]);
      else list.push(r.tag);
    }
    return out;
  }
}
