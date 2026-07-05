import path from 'node:path';
import { beforeEach, describe, it, expect } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { ToolNameSchema } from '@tepegoz/shared-types';
import type { FileAccessGrant } from '@tepegoz/shared-types/file-access';
import { FileAccessPolicy } from './file-access-policy';
import { registerFileOperations, resetFileOperationsForTest } from './file-operations';
import type { DirEntry, FileStat, FileSystemHost, GrantStore } from './fs-host';

const ROOT = path.resolve('fileops-test-root');

/** Minimal in-memory filesystem + grant store for exercising the tool handlers. */
function makeFakes(policy: FileAccessPolicy) {
  const files = new Map<string, string>();
  const dirs = new Set<string>([ROOT]);
  let grantList: FileAccessGrant[] = [{ path: ROOT, mode: 'full', recursive: true }];
  policy.setGrants(grantList);

  const host: FileSystemHost = {
    canonicalize: (p) => Promise.resolve(path.resolve(p)),
    readFile: (p) => Promise.resolve(files.get(p) ?? ''),
    writeFile: (p, c) => {
      files.set(p, c);
      return Promise.resolve();
    },
    appendFile: (p, c) => {
      files.set(p, (files.get(p) ?? '') + c);
      return Promise.resolve();
    },
    mkdir: (p) => {
      dirs.add(p);
      return Promise.resolve();
    },
    readdir: (): Promise<DirEntry[]> => Promise.resolve([{ name: 'a.txt', kind: 'file' }]),
    stat: (): Promise<FileStat> =>
      Promise.resolve({ kind: 'file', size: 3, modifiedMs: 0, createdMs: 0 }),
    exists: (p) => Promise.resolve(files.has(p) || dirs.has(p)),
    rename: (from, to) => {
      files.set(to, files.get(from) ?? '');
      files.delete(from);
      return Promise.resolve();
    },
    copyFile: (from, to) => {
      files.set(to, files.get(from) ?? '');
      return Promise.resolve();
    },
    remove: (p) => {
      files.delete(p);
      dirs.delete(p);
      return Promise.resolve();
    },
    search: (root) => Promise.resolve([path.join(root, 'a.txt')]),
  };

  const grants: GrantStore = {
    list: () => grantList,
    add: (g) => {
      grantList = [...grantList, g];
      policy.setGrants(grantList);
      return Promise.resolve();
    },
    remove: (p) => {
      grantList = grantList.filter((g) => g.path !== p);
      policy.setGrants(grantList);
      return Promise.resolve();
    },
    update: (p, patch) => {
      grantList = grantList.map((g) => (g.path === p ? { ...g, ...patch } : g));
      policy.setGrants(grantList);
      return Promise.resolve();
    },
  };

  return { host, grants, files };
}

async function invoke(id: string, args: unknown): Promise<unknown> {
  const tool = CapabilityRegistry.get(id);
  if (tool === undefined) throw new Error(`not registered: ${id}`);
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) throw new Error(`invalid args for ${id}`);
  return await tool.handler(parsed.data);
}

describe('registerFileOperations', () => {
  let policy: FileAccessPolicy;

  beforeEach(() => {
    CapabilityRegistry.reset();
    resetFileOperationsForTest();
    policy = new FileAccessPolicy();
    const { host, grants } = makeFakes(policy);
    registerFileOperations({ host, policy, grants });
  });

  it('registers the full tool set once, all with schema-valid names', () => {
    const ids = CapabilityRegistry.list().map((d) => d.id);
    expect(ids).toContain('file_get_content');
    expect(ids).toContain('file_delete_entry');
    expect(ids).toContain('fileaccess_create_grant');
    expect(ids.length).toBe(14);
    for (const id of ids) expect(() => ToolNameSchema.parse(id)).not.toThrow();
  });

  it('is idempotent (a second call registers nothing new)', () => {
    const before = CapabilityRegistry.list().length;
    const p2 = new FileAccessPolicy();
    const { host, grants } = makeFakes(p2);
    registerFileOperations({ host, policy: p2, grants });
    expect(CapabilityRegistry.list().length).toBe(before);
  });

  it('reads and writes inside a grant', async () => {
    const file = path.join(ROOT, 'a.txt');
    await invoke('file_create_file', { path: file, content: 'hi' });
    const read = (await invoke('file_get_content', { path: file })) as { content: string };
    expect(read.content).toBe('hi');
  });

  it('refuses a path outside every grant (hard sandbox, 403)', async () => {
    const outside = path.resolve('somewhere-else', 'secret.txt');
    await expect(invoke('file_get_content', { path: outside })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects creating a file that already exists (409)', async () => {
    const file = path.join(ROOT, 'dupe.txt');
    await invoke('file_create_file', { path: file, content: 'x' });
    await expect(invoke('file_create_file', { path: file, content: 'y' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('fileaccess_create_grant persists a new grant via the store', async () => {
    const newDir = path.resolve('extra-folder');
    const grant = (await invoke('fileaccess_create_grant', {
      path: newDir,
      mode: 'read',
    })) as FileAccessGrant;
    expect(grant.path).toBe(newDir);
    expect(grant.mode).toBe('read');
    expect(policy.isWithinAnyGrant(path.join(newDir, 'f.txt'))).toBe(true);
  });
});
