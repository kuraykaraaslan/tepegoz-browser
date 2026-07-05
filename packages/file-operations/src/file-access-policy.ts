import path from 'node:path';
import { AppError } from '@tepegoz/libs';
import {
  type FileAccessGrant,
  type FileAccessMode,
  modeAllows,
} from '@tepegoz/shared-types/file-access';

/**
 * The security core of `@tepegoz/file-operations`: pure path-math over the user's folder grants. No
 * `node:fs` and no Electron — it operates on already-canonicalized absolute paths (the host resolves
 * symlinks via `realpath` first), so it is fully unit-testable.
 *
 * Two enforcement roles (defense in depth):
 *  1. {@link assertMembership} — the HARD sandbox every tool handler calls: a path outside every
 *     granted root is refused (403), no matter what. This is what confines the agent to the whitelist.
 *  2. {@link decide} — the MODE gate the ToolGateway confirm handler consults for a mutating op:
 *     `allow` (op ≤ grant mode → run silently), `ask` (op exceeds grant mode → prompt the user), or
 *     `deny` (path in no grant). Mode is gated here (not in the handler) so an *approved* escalation
 *     still runs — the handler only re-checks membership, which an approval never widens.
 */
export type FileAccessDecision = 'allow' | 'ask' | 'deny';

/** Containment test for two absolute, canonical paths. `depth` is `child`'s nesting below `parent`
 *  (0 = the folder itself, 1 = a direct child). `inside` is false when `child` escapes `parent`. */
function contains(parent: string, child: string): { inside: boolean; depth: number } {
  const rel = path.relative(parent, child);
  if (rel === '') return { inside: true, depth: 0 };
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return { inside: false, depth: 0 };
  }
  return { inside: true, depth: rel.split(path.sep).length };
}

export class FileAccessPolicy {
  private grants: FileAccessGrant[];

  constructor(grants: readonly FileAccessGrant[] = []) {
    this.grants = grants.map((g) => ({ ...g }));
  }

  /** Replace the live grant set (main calls this on preference changes). */
  setGrants(grants: readonly FileAccessGrant[]): void {
    this.grants = grants.map((g) => ({ ...g }));
  }

  getGrants(): readonly FileAccessGrant[] {
    return this.grants;
  }

  /** The most-specific grant covering `realPath` (honoring `recursive`), or null when outside all. */
  resolveGrant(realPath: string): FileAccessGrant | null {
    let best: FileAccessGrant | null = null;
    for (const grant of this.grants) {
      const { inside, depth } = contains(grant.path, realPath);
      if (!inside) continue;
      if (!grant.recursive && depth > 1) continue;
      if (best === null || grant.path.length > best.path.length) best = grant;
    }
    return best;
  }

  isWithinAnyGrant(realPath: string): boolean {
    return this.resolveGrant(realPath) !== null;
  }

  /** Hard sandbox — throws 403 when `realPath` is outside every granted folder. */
  assertMembership(realPath: string): void {
    if (!this.isWithinAnyGrant(realPath)) {
      throw new AppError(`File access denied: '${realPath}' is not within an allowed folder`, 403);
    }
  }

  /** Mode gate for the confirm handler: does a `requiredMode` op on `realPath` run, prompt, or deny? */
  decide(realPath: string, requiredMode: FileAccessMode): FileAccessDecision {
    const grant = this.resolveGrant(realPath);
    if (grant === null) return 'deny';
    return modeAllows(grant.mode, requiredMode) ? 'allow' : 'ask';
  }
}
