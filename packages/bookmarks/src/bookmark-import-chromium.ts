import {
  MAX_DEPTH,
  MAX_NODES,
  MAX_TITLE_CHARS,
  MAX_URL_CHARS,
  type ImportedBookmarkFolder,
  type ParsedBookmarks,
} from './bookmark-import-limits';

/**
 * Chromium's own `Bookmarks` file — the JSON a Chrome/Edge/Brave profile keeps on disk.
 *
 * This exists next to the Netscape HTML parser rather than replacing it, because they read different
 * things: the HTML parser reads a file the user EXPORTED, this reads the profile the user still has.
 * Auto-detect only works against the on-disk profile, and asking someone to first export from the
 * browser they are trying to leave is the friction the feature exists to remove.
 *
 * Untrusted like every other import source — the file belongs to another application, may be from a
 * newer schema, and may be corrupt. Same caps as the HTML path, enforced DURING the walk, and the same
 * `safeParse` boundary at the store.
 */

/** One node as Chromium writes it. Only the fields this importer reads are named. */
interface ChromiumNode {
  type?: unknown;
  name?: unknown;
  url?: unknown;
  children?: unknown;
}

/**
 * The three roots Chromium always writes, in the order they are presented in its own UI. `synced`
 * ("Mobile bookmarks") is included: it is bookmarks the user owns, and dropping it would be a silent
 * partial import — the failure mode this repo keeps refusing.
 */
const ROOT_KEYS = ['bookmark_bar', 'other', 'synced'] as const;
/** Fallback folder titles when the file omits a root's `name` (older profiles do). */
const ROOT_FALLBACK_TITLES: Record<(typeof ROOT_KEYS)[number], string> = {
  bookmark_bar: 'Bookmarks bar',
  other: 'Other bookmarks',
  synced: 'Mobile bookmarks',
};

/**
 * Parse a Chromium `Bookmarks` file. Returns `null` when the text is not one — an unreadable file must
 * be reported to the user as unreadable, never as an import that quietly found nothing.
 */
export function parseChromiumBookmarksJson(json: string): ParsedBookmarks | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const roots = (parsed as { roots?: unknown } | null)?.roots;
  if (roots === null || typeof roots !== 'object') return null;

  const root: ImportedBookmarkFolder = { type: 'folder', title: 'root', children: [] };
  const budget = { nodes: 0, truncated: false };

  for (const key of ROOT_KEYS) {
    const node = (roots as Record<string, unknown>)[key];
    if (node === null || typeof node !== 'object') continue;
    const folder: ImportedBookmarkFolder = {
      type: 'folder',
      title: text((node as ChromiumNode).name, MAX_TITLE_CHARS) || ROOT_FALLBACK_TITLES[key],
      children: [],
    };
    root.children.push(folder);
    walk((node as ChromiumNode).children, folder, 1, budget);
  }

  return { root, truncated: budget.truncated };
}

/** Depth is bounded by MAX_DEPTH, so this recursion cannot outrun the stack on a hostile file. Past
 *  that depth children flatten into the deepest kept folder — misplacing a bookmark beats losing it. */
function walk(
  children: unknown,
  parent: ImportedBookmarkFolder,
  depth: number,
  budget: { nodes: number; truncated: boolean },
): void {
  if (!Array.isArray(children)) return;
  for (const raw of children) {
    if (budget.truncated) return;
    if (raw === null || typeof raw !== 'object') continue;
    const node = raw as ChromiumNode;
    if (budget.nodes >= MAX_NODES) {
      budget.truncated = true;
      return;
    }
    budget.nodes++;

    if (node.type === 'url') {
      const url = text(node.url, MAX_URL_CHARS);
      if (url.length === 0) continue;
      parent.children.push({
        type: 'bookmark',
        title: text(node.name, MAX_TITLE_CHARS) || url,
        url,
        // Chromium keeps favicons in a separate `Favicons` database, never in this file. Null is the
        // honest answer; the app refetches an icon the next time the page is visited.
        favicon: null,
      });
      continue;
    }
    // Anything that is not a URL and carries children is treated as a folder — Chromium has written
    // 'folder' for two decades, but a type this importer does not know must not swallow its subtree.
    if (!Array.isArray(node.children)) continue;
    if (depth >= MAX_DEPTH) {
      walk(node.children, parent, depth, budget);
      continue;
    }
    const folder: ImportedBookmarkFolder = {
      type: 'folder',
      title: text(node.name, MAX_TITLE_CHARS) || 'Folder',
      children: [],
    };
    parent.children.push(folder);
    walk(node.children, folder, depth + 1, budget);
  }
}

/** Coerce-and-cap. Truncate rather than reject: an absurd title is a malformed file, not a reason to
 *  lose the bookmark that carries it. */
function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}
