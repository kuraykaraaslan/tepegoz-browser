import type { FileAccessGrant, FileAccessMode } from '@tepegoz/shared-types/file-access';

/** How file content crosses the boundary. `base64` lets the agent read/write binary safely over IPC. */
export type FileEncoding = 'utf8' | 'base64';

/** A directory entry as surfaced to the agent. */
export interface DirEntry {
  name: string;
  kind: 'file' | 'directory' | 'other';
}

/** Compact stat projection (no platform-specific fields). Times are epoch ms. */
export interface FileStat {
  kind: 'file' | 'directory' | 'other';
  size: number;
  modifiedMs: number;
  createdMs: number;
}

/**
 * The filesystem operations the file tools need, abstracted away from `node:fs` so
 * `@tepegoz/file-operations` stays environment-agnostic and unit-testable. The desktop app implements
 * it over `node:fs/promises`; tests pass an in-memory fake.
 *
 * Every method except {@link canonicalize} receives an ALREADY-canonicalized absolute path — the tool
 * handlers canonicalize the untrusted input and assert it is inside a grant (the hard sandbox) BEFORE
 * calling any operation here. Implementations must still fail safe (ENOENT → throw), but must not
 * re-open the sandbox question.
 */
export interface FileSystemHost {
  /**
   * Resolve `inputPath` to an absolute, symlink-free path. For a target that does not exist yet
   * (create ops), resolve the nearest existing ancestor and re-append the remaining segments, so the
   * result can be sandbox-checked without the file existing. Throws {@link AppError} 400 when
   * `inputPath` is not absolute.
   */
  canonicalize(inputPath: string): Promise<string>;
  readFile(path: string, encoding: FileEncoding): Promise<string>;
  writeFile(path: string, content: string, encoding: FileEncoding): Promise<void>;
  appendFile(path: string, content: string, encoding: FileEncoding): Promise<void>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<DirEntry[]>;
  stat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  remove(path: string, recursive: boolean): Promise<void>;
  /** Absolute paths under `root` matching glob `pattern` (host picks the glob engine), capped at `limit`. */
  search(root: string, pattern: string, limit: number): Promise<string[]>;
}

/**
 * Persists the folder whitelist and keeps the live {@link FileAccessPolicy} in sync. Implemented in the
 * main process over the preferences store; kept as a seam so the package never imports the store. Each
 * mutating method must persist AND call `policy.setGrants(...)` before resolving (the constructor of the
 * host does the wiring).
 */
export interface GrantStore {
  list(): FileAccessGrant[];
  add(grant: FileAccessGrant): Promise<void>;
  remove(path: string): Promise<void>;
  update(path: string, patch: { mode?: FileAccessMode; recursive?: boolean }): Promise<void>;
}
