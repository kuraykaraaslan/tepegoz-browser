import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { FileAccessPolicy } from '@tepegoz/file-operations';
import type { FileAccessGrant } from '@tepegoz/shared-types/file-access';
import FileOperationsHost from './file-operations-host';

/**
 * S6's "Regression coverage for the file-sandbox traversal guard" (browser-use-agent-parity P3-a):
 * browser-use had a disclosed, patched CVE (GHSA-j9hj-92j8-jv9h) in exactly this class — an
 * agent-supplied path, naively joined, resolving outside the sandbox during an upload.
 *
 * Every OTHER test that touches `canonicalize` or `FileAccessPolicy` mocks at least one of `node:fs`,
 * `node:fs/promises`, or `@tepegoz/file-operations` itself — which proves the STRING logic but never
 * proves the real combination holds against a real filesystem's real `..` collapsing and real symlink
 * resolution. This file mocks nothing: a real temp directory, real files, and (where the platform
 * allows it) a real symlink, run through the REAL `FileOperationsHost.canonicalize` +
 * `FileAccessPolicy.assertMembership` pair exactly as `guard()` in `file-operations-tools.ts` chains
 * them.
 */

let root: string;
let allowed: string;
let sibling: string;
let outside: string;
let policy: FileAccessPolicy;
let symlinkSupported = false;
let escapeLink: string;

beforeAll(() => {
  // Resolved immediately: on macOS, `os.tmpdir()` itself sits behind a symlink (`/tmp` → `/private/tmp`),
  // and canonicalize() would return the resolved form regardless — fixing `root` to its OWN realpath
  // once keeps every expected/actual comparison below apples-to-apples, independent of that platform
  // quirk, which has nothing to do with the sandbox property under test.
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tepegoz-sandbox-')));
  allowed = path.join(root, 'allowed');
  // A sibling whose STRING starts with `allowed`'s string — the classic `startsWith(grant)` bug this
  // package's `contains()` avoids by using `path.relative` instead.
  sibling = path.join(root, 'allowed-evil');
  outside = path.join(root, 'outside');
  mkdirSync(allowed, { recursive: true });
  mkdirSync(sibling, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(allowed, 'ok.txt'), 'inside');
  writeFileSync(path.join(sibling, 'secret.txt'), 'sibling, not inside');
  writeFileSync(path.join(outside, 'passwd'), 'outside');

  const grant: FileAccessGrant = { path: allowed, mode: 'full', recursive: true };
  policy = new FileAccessPolicy([grant]);

  // A symlink INSIDE the grant pointing OUTSIDE it — the exact shape of the disclosed CVE. Windows
  // needs a 'junction' (directory-only, no elevation) rather than a plain symlink (which needs
  // Administrator or Developer Mode); other platforms take the default.
  escapeLink = path.join(allowed, 'escape');
  try {
    symlinkSync(outside, escapeLink, process.platform === 'win32' ? 'junction' : 'dir');
    symlinkSupported = true;
  } catch {
    symlinkSupported = false; // no permission on this machine/CI runner — skip the symlink cases below
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The exact chain `guard()` in `file-operations-tools.ts` runs for every file tool call. */
async function guardedRealpath(input: string): Promise<string> {
  const real = await FileOperationsHost.canonicalize(input);
  policy.assertMembership(real);
  return real;
}

describe('file-sandbox traversal guard (S6, real filesystem — no mocks)', () => {
  it('allows an ordinary path inside the grant', async () => {
    await expect(guardedRealpath(path.join(allowed, 'ok.txt'))).resolves.toBe(
      path.join(allowed, 'ok.txt'),
    );
  });

  it('rejects literal `..` traversal out of the grant', async () => {
    const traversal = path.join(allowed, '..', 'outside', 'passwd');
    await expect(guardedRealpath(traversal)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a sibling folder whose name merely STARTS WITH the grant path', async () => {
    // `allowed-evil` is not inside `allowed` — only a naive `path.startsWith(grant)` check (without a
    // separator boundary) would get this wrong.
    await expect(guardedRealpath(path.join(sibling, 'secret.txt'))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects READING an existing file reached through a symlink that escapes the grant', async () => {
    if (!symlinkSupported) return; // this runner cannot create symlinks; see beforeAll
    const throughLink = path.join(escapeLink, 'passwd');
    await expect(guardedRealpath(throughLink)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects CREATING a new file reached through a symlink that escapes the grant', async () => {
    if (!symlinkSupported) return;
    // The target file does not exist yet, so canonicalize takes the nearest-existing-ancestor branch
    // (walks up to `escapeLink`, which DOES exist) rather than the direct-realpath branch — the two
    // code paths in canonicalize() are different, and only a real, non-existent target exercises this
    // one. The disclosed CVE was specifically in an upload (create) path, not a read.
    const newFileThroughLink = path.join(escapeLink, 'newfile.txt');
    await expect(guardedRealpath(newFileThroughLink)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('still allows creating a new file inside the grant (the symlink guard is not overzealous)', async () => {
    const newFile = path.join(allowed, 'brand-new.txt');
    await expect(guardedRealpath(newFile)).resolves.toBe(newFile);
  });
});
