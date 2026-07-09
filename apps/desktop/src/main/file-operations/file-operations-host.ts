import { homedir } from 'node:os';
import path from 'node:path';
import {
  appendFile,
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { AppError, Logger } from '@tepegoz/libs';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import PreferenceStore from '@tepegoz/preferences';
import type { FileAccessGrant, FileAccessMode } from '@tepegoz/shared-types/file-access';
import {
  FileAccessPolicy,
  FILE_OP_REQUIRED_MODE,
  registerFileOperations,
  type DirEntry,
  type FileStat,
  type FileSystemHost,
  type GrantStore,
} from '@tepegoz/file-operations';

/**
 * Electron/Node wiring for the agent's sandboxed file operations. Implements the Electron-free
 * `@tepegoz/file-operations` seams over `node:fs/promises`, seeds the default `~/tepegoz` grant on first
 * run, keeps the live {@link FileAccessPolicy} in sync with `Preferences.fileAccessGrants` +
 * `fileOperationsEnabled`, and decides the auto-vs-prompt outcome for file tool calls (consulted by the
 * agent-run confirm handler). Registered once at startup; the file tools then live behind the same
 * ToolGateway PEP as every other capability.
 */

/** Resolve `input` to an absolute, symlink-free path. For a target that doesn't exist yet (create ops),
 *  canonicalize the nearest existing ancestor and re-append the remaining segments. Throws 400 when the
 *  input is not absolute. */
async function canonicalize(input: string): Promise<string> {
  if (!path.isAbsolute(input)) {
    throw new AppError(`File path must be absolute: '${input}'`, 400);
  }
  let current = path.normalize(input);
  const suffix: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      return suffix.length === 0 ? real : path.join(real, ...suffix.toReversed());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.normalize(input); // nothing on the branch exists
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}

/** Translate a `**`/`*`/`?` glob into an anchored RegExp matched against a `/`-separated relative path. */
function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? '';
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++; // `**/` also matches zero segments
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, String.raw`\$&`);
  }
  return new RegExp(`^${re}$`);
}

const MAX_WALK_ENTRIES = 20_000;

/**
 * Extensions we refuse to `shell.openPath` — on Windows/Linux the OS shell would EXECUTE these rather
 * than open a document. The agent can write files into a `full`-grant folder (e.g. the seeded ~/tepegoz)
 * unattended, so "open the file I made" must never become "run the program I made". Documents open fine.
 */
const BLOCKED_OPEN_EXT = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.cpl', '.reg', '.hta',
  '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.lnk', '.url', '.inf',
  '.jar', '.sh', '.bash', '.desktop', '.app', '.command', '.py', '.rb', '.pl',
]);

/** Classify a stat/dirent as the compact kind the tools surface. */
function kindOf(s: { isFile(): boolean; isDirectory(): boolean }): DirEntry['kind'] {
  if (s.isFile()) return 'file';
  if (s.isDirectory()) return 'directory';
  return 'other';
}

const fsHost: FileSystemHost = {
  canonicalize,
  async readFile(p, encoding) {
    if (encoding === 'base64') return (await readFile(p)).toString('base64');
    return readFile(p, 'utf8');
  },
  async writeFile(p, content, encoding) {
    await writeFile(p, encoding === 'base64' ? Buffer.from(content, 'base64') : content);
  },
  async appendFile(p, content, encoding) {
    await appendFile(p, encoding === 'base64' ? Buffer.from(content, 'base64') : content);
  },
  async mkdir(p) {
    await mkdir(p, { recursive: true });
  },
  async readdir(p): Promise<DirEntry[]> {
    const entries = await readdir(p, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, kind: kindOf(e) }));
  },
  async stat(p): Promise<FileStat> {
    const s = await stat(p);
    return { kind: kindOf(s), size: s.size, modifiedMs: s.mtimeMs, createdMs: s.birthtimeMs };
  },
  async exists(p) {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async copyFile(from, to) {
    await copyFile(from, to);
  },
  async remove(p, recursive) {
    await rm(p, { recursive, force: false });
  },
  async search(root, pattern, limit): Promise<string[]> {
    const re = globToRegExp(pattern);
    const out: string[] = [];
    let visited = 0;
    const walk = async (dir: string): Promise<void> => {
      if (out.length >= limit || visited >= MAX_WALK_ENTRIES) return;
      let entries: DirEntry[];
      try {
        entries = await fsHost.readdir(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (out.length >= limit || visited >= MAX_WALK_ENTRIES) return;
        visited++;
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full).split(path.sep).join('/');
        if (entry.kind === 'directory') await walk(full);
        else if (re.test(rel)) out.push(full);
      }
    };
    await walk(root);
    return out;
  },
};

const policy = new FileAccessPolicy();

const grantStore: GrantStore = {
  list: () => FileOperationsHost.effectiveGrants(),
  add: (grant) => FileOperationsHost.addGrant(grant),
  remove: (p) => FileOperationsHost.removeGrant(p),
  update: (p, patch) => FileOperationsHost.updateGrant(p, patch),
};

/** Outcome the agent-run confirm handler acts on: run/deny silently, or defer to the HITL modal. */
export type FileConsentDecision =
  | { type: 'auto'; approved: boolean }
  | { type: 'fallthrough' };

export default class FileOperationsHost {
  private static started = false;

  /** Seed the default grant (first run), sync the policy, and register the file tools (idempotent). */
  static init(): void {
    if (FileOperationsHost.started) return;
    FileOperationsHost.started = true;
    FileOperationsHost.seedDefaultGrant();
    FileOperationsHost.applyGrants();
    registerFileOperations({ host: fsHost, policy, grants: grantStore });
  }

  /** Re-sync the live policy from preferences (called when `fileAccessGrants`/`fileOperationsEnabled`
   *  change via Settings). */
  static reconcile(): void {
    FileOperationsHost.applyGrants();
  }

  /** Resolve a path to its absolute, symlink-free form — so a folder picked in Settings is stored the
   *  same way the sandbox compares it (matching `realpath`). */
  static canonicalize(input: string): Promise<string> {
    return canonicalize(input);
  }

  /** Canonicalize `input`, assert it is inside an allowed folder, is a regular file, and is not an
   *  executable/script (which the OS shell would RUN, not open). Throws {@link AppError} (403/400)
   *  otherwise; returns the real path. Gates opening an agent-produced file from the renderer. */
  static async assertOpenablePath(input: string): Promise<string> {
    const real = await canonicalize(input);
    policy.assertMembership(real);
    const stat = await fsHost.stat(real); // throws if the path doesn't exist
    if (stat.kind !== 'file') {
      throw new AppError(`Not a regular file: '${real}'`, 400);
    }
    if (BLOCKED_OPEN_EXT.has(path.extname(real).toLowerCase())) {
      throw new AppError(`Refusing to open an executable/script: '${real}'`, 403);
    }
    return real;
  }

  /**
   * Write a user-initiated export (the agent chat log) into the app's default `~/tepegoz` workspace via
   * the file-operations fs host — never raw `node:fs`. This is a FIRST-PARTY action on the user's OWN
   * data to a FIXED, canonicalized destination with a single filename segment, so — unlike the agent's
   * file tools — it does NOT depend on the "Allow file operations" master switch or a folder grant
   * (those gate the *untrusted*, model-driven file tools). The hardcoded `~/tepegoz` target plus the
   * traversal check below make it impossible to write anywhere else. Returns the absolute path.
   */
  static async writeExport(filename: string, content: string): Promise<string> {
    const dir = await canonicalize(path.join(homedir(), 'tepegoz'));
    const target = await canonicalize(path.join(dir, filename));
    // Defense in depth: the filename is server-generated and separator-free, but reject anything that
    // resolves outside ~/tepegoz regardless (e.g. a future caller passing a crafted name).
    if (path.dirname(target) !== dir) {
      throw new AppError(`Invalid export filename: '${filename}'`, 400);
    }
    await fsHost.mkdir(dir);
    await fsHost.writeFile(target, content, 'utf8');
    return target;
  }

  /**
   * Write a user-initiated multi-file export (the agent diagnostic bundle) into a fresh
   * `~/tepegoz/<dirName>/` folder — same first-party rationale + fixed destination as {@link writeExport},
   * extended to a directory tree (subfolders like `tabs/`, plus binary `base64` files for PNGs). Each
   * file's resolved target is re-checked to stay strictly inside the bundle folder (traversal defense in
   * depth), and its parent directory is created first. Returns the absolute bundle folder path.
   */
  static async writeExportBundle(
    dirName: string,
    files: { relPath: string; content: string; encoding?: 'utf8' | 'base64' }[],
  ): Promise<string> {
    const root = await canonicalize(path.join(homedir(), 'tepegoz'));
    const bundleDir = await canonicalize(path.join(root, dirName));
    // The bundle folder itself must sit directly under ~/tepegoz (server-generated, separator-free name).
    if (path.dirname(bundleDir) !== root) {
      throw new AppError(`Invalid export bundle name: '${dirName}'`, 400);
    }
    await fsHost.mkdir(bundleDir);
    for (const file of files) {
      const target = await canonicalize(path.join(bundleDir, file.relPath));
      // Reject anything that resolves outside the bundle folder regardless of the relPath given.
      if (target !== bundleDir && !target.startsWith(bundleDir + path.sep)) {
        throw new AppError(`Invalid export file path: '${file.relPath}'`, 400);
      }
      await fsHost.mkdir(path.dirname(target));
      await fsHost.writeFile(target, file.content, file.encoding ?? 'utf8');
    }
    return bundleDir;
  }

  /** Canonicalize `input`, assert it is inside an allowed folder, and assert it is a regular file.
   *  Used by the upload broker before a local path is bound to an untrusted page's file input. */
  static async assertReadableFile(input: string): Promise<string> {
    const real = await canonicalize(input);
    policy.assertMembership(real);
    const stat = await fsHost.stat(real);
    if (stat.kind !== 'file') {
      throw new AppError(`Not a regular file: '${real}'`, 400);
    }
    return real;
  }

  /** The grants actually in force: the persisted list when file ops are enabled, else none. */
  static effectiveGrants(): FileAccessGrant[] {
    const prefs = PreferenceStore.getAll();
    return prefs.fileOperationsEnabled ? prefs.fileAccessGrants : [];
  }

  private static applyGrants(): void {
    policy.setGrants(FileOperationsHost.effectiveGrants());
  }

  /** On first run, create `~/tepegoz` and grant it full access; the sentinel stops any re-seed. */
  private static seedDefaultGrant(): void {
    const prefs = PreferenceStore.getAll();
    if (prefs.fileAccessSeeded) return;
    const dir = path.join(homedir(), 'tepegoz');
    // Fire the mkdir but don't block startup on it; the grant is what matters (the folder is also created
    // lazily by the first write). A failure is logged, not fatal.
    void mkdir(dir, { recursive: true }).catch((err: unknown) => {
      Logger.warn('Could not create default file-operations folder', { dir, err: String(err) });
    });
    PreferenceStore.update({
      fileAccessSeeded: true,
      fileAccessGrants: [{ path: dir, mode: 'full', recursive: true }],
    });
  }

  // Grant mutations are synchronous under the hood (PreferenceStore is in-memory + file-backed); they
  // return a resolved promise to satisfy the async `GrantStore` seam the core expects.
  static addGrant(grant: FileAccessGrant): Promise<void> {
    const grants = PreferenceStore.getAll().fileAccessGrants.filter((g) => g.path !== grant.path);
    PreferenceStore.update({ fileAccessGrants: [...grants, grant] });
    FileOperationsHost.applyGrants();
    return Promise.resolve();
  }

  static removeGrant(folder: string): Promise<void> {
    const grants = PreferenceStore.getAll().fileAccessGrants.filter((g) => g.path !== folder);
    PreferenceStore.update({ fileAccessGrants: grants });
    FileOperationsHost.applyGrants();
    return Promise.resolve();
  }

  static updateGrant(
    folder: string,
    patch: { mode?: FileAccessMode; recursive?: boolean },
  ): Promise<void> {
    const grants = PreferenceStore.getAll().fileAccessGrants.map((g) =>
      g.path === folder ? { ...g, ...patch } : g,
    );
    PreferenceStore.update({ fileAccessGrants: grants });
    FileOperationsHost.applyGrants();
    return Promise.resolve();
  }

  /**
   * Decide a gated file tool call for the agent-run confirm handler: a mutation within the folder's
   * granted mode runs silently (`auto`, approved); one outside every grant is refused (`auto`, denied);
   * an escalation (op exceeds the grant mode) or a grant-management tool defers to the HITL modal
   * (`fallthrough`) so the user approves it explicitly. Non-file tools always fall through.
   */
  static async consentDecision(req: ConfirmRequest): Promise<FileConsentDecision> {
    const required = FILE_OP_REQUIRED_MODE[req.toolName];
    if (required === undefined) return { type: 'fallthrough' };
    const args = (req.args ?? {}) as { path?: unknown; to?: unknown };
    const target = typeof args.to === 'string' ? args.to : args.path;
    if (typeof target !== 'string') return { type: 'fallthrough' };
    const real = await canonicalize(target);
    const decision = policy.decide(real, required);
    if (decision === 'allow') return { type: 'auto', approved: true };
    if (decision === 'deny') return { type: 'auto', approved: false };
    return { type: 'fallthrough' }; // 'ask' → user approves via the agent HITL modal
  }
}
