/**
 * File-access grant model — the user-configured folder whitelist that sandboxes the agent's file
 * operations. A self-contained, zod-free / preload-safe module (like `search-engines.ts` and
 * `providers.ts`) so the renderer, the sandboxed preload, the IPC contract, the preferences schema,
 * and the `@tepegoz/file-operations` core can all share ONE definition (no drift).
 *
 * Each grant authorizes file operations inside `path` (and its subfolders when `recursive`), up to the
 * granted `mode`. The grant's mode IS the authorization: an op within the mode runs automatically, an
 * op that exceeds it prompts the user (HITL), and a path in no grant is refused. Enforcement lives in
 * `@tepegoz/file-operations` (hard path-sandbox) + the ToolGateway confirm handler (the mode gate).
 */

/** Permission tiers, least → most permissive. Persisted verbatim in `Preferences.fileAccessGrants`. */
export const FILE_ACCESS_MODES = ['read', 'read-write', 'full'] as const;
export type FileAccessMode = (typeof FILE_ACCESS_MODES)[number];

/**
 * One whitelisted folder the agent may operate in.
 * - `read`       — read/list/stat/search only.
 * - `read-write` — the above plus create/write/append/mkdir/copy/move (NO delete).
 * - `full`       — the above plus delete.
 */
export interface FileAccessGrant {
  /** Absolute, canonical folder path (symlinks resolved before persisting). */
  path: string;
  /** The permission tier granted for this folder. */
  mode: FileAccessMode;
  /** When true the grant covers all nested subfolders; when false only direct children. */
  recursive: boolean;
}

/** Mode ordering for `granted ≥ required` comparisons. Higher = more permissive. */
export const FILE_ACCESS_MODE_RANK: Record<FileAccessMode, number> = {
  read: 0,
  'read-write': 1,
  full: 2,
};

/** True when a folder granted at `granted` permits an op that needs at least `required`. */
export function modeAllows(granted: FileAccessMode, required: FileAccessMode): boolean {
  return FILE_ACCESS_MODE_RANK[granted] >= FILE_ACCESS_MODE_RANK[required];
}
