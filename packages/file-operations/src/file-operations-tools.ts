import { AppError } from '@tepegoz/libs';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { FileAccessMode } from '@tepegoz/shared-types/file-access';
import type { FileEncoding } from './fs-host';
import type { FileOperationsDeps } from './file-operations';
import {
  ReadFileArgs,
  ListArgs,
  MetaArgs,
  SearchArgs,
  CreateFileArgs,
  UpdateFileArgs,
  MkdirArgs,
  CopyArgs,
  MoveArgs,
  DeleteArgs,
  NoArgs,
  CreateGrantArgs,
  UpdateGrantArgs,
  DeleteGrantArgs,
} from './file-operations-schemas';

/**
 * Per-tool registration for the `file_*` (read/write/destructive) tool group. Split out of
 * `./file-operations` (ADR-0010 250-line cap); the `fileaccess_*` grant-management tool group
 * lives in `./file-operations-grant-tools`, which reuses {@link descriptor} from here. The
 * orchestrator in `./file-operations` calls both registration functions once.
 */

export function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
  opts: { requiresIdempotencyKey?: boolean; aiTask?: ToolDescriptor['aiTask'] } = {},
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: opts.requiresIdempotencyKey ?? false,
    aiTask: opts.aiTask ?? 'none',
    category: 'file',
  };
}

/** Registers every `file_*` / `fileaccess_*` ToolDescriptor into the CapabilityRegistry. */
export function registerFileTools(deps: FileOperationsDeps): void {
  const { host, policy, grants } = deps;

  /** Canonicalize untrusted input and enforce the hard sandbox; returns the real absolute path. */
  const guard = async (input: string): Promise<string> => {
    const real = await host.canonicalize(input);
    policy.assertMembership(real);
    return real;
  };

  const enc = (e: FileEncoding | undefined): FileEncoding => e ?? 'utf8';

  // --- Read tools (dangerClass 'read' → policy auto-allows; membership enforced in `guard`). ---

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_get_content',
      'read',
      'Read a file inside an allowed folder. args: { path: string, encoding?: "utf8"|"base64" } — ' +
        'returns { path, encoding, content }. Use "base64" for binary files.',
      { aiTask: 'read_understand' },
    ),
    inputSchema: ReadFileArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      const encoding = enc(args.encoding);
      return { path: real, encoding, content: await host.readFile(real, encoding) };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_list_items',
      'read',
      'List the entries of a directory inside an allowed folder. args: { path: string } — returns ' +
        '{ path, entries: [{ name, kind: "file"|"directory"|"other" }] }.',
    ),
    inputSchema: ListArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      return { path: real, entries: await host.readdir(real) };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_get_metadata',
      'read',
      'Stat a path inside an allowed folder. args: { path: string } — returns ' +
        '{ path, exists, kind?, size?, modifiedMs?, createdMs? }.',
    ),
    inputSchema: MetaArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      if (!(await host.exists(real))) return { path: real, exists: false };
      const s = await host.stat(real);
      return { path: real, exists: true, ...s };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_search_items',
      'read',
      'Find files under a directory inside an allowed folder by glob. args: { path: string, ' +
        'pattern: string (e.g. "**/*.md"), limit?: number (default 200, max 1000) } — returns ' +
        '{ path, matches: string[] } (absolute paths, all still inside the allowed folder).',
    ),
    inputSchema: SearchArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      const matches = await host.search(real, args.pattern, args.limit ?? 200);
      // Every hit must remain inside a grant (defeats a symlinked match escaping the root).
      const safe: string[] = [];
      for (const m of matches) {
        const rp = await host.canonicalize(m);
        if (policy.isWithinAnyGrant(rp)) safe.push(rp);
      }
      return { path: real, matches: safe };
    },
  });

  // --- Write tools (dangerClass 'state_changing' → HITL unless the grant mode already permits it). ---

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_create_file',
      'state_changing',
      'Create a NEW file inside an allowed folder (fails if it already exists — use file_update_file ' +
        'to change an existing one). args: { path: string, content: string, encoding?: "utf8"|"base64" } ' +
        '— returns { path }.',
      { requiresIdempotencyKey: true },
    ),
    inputSchema: CreateFileArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      if (await host.exists(real)) {
        throw new AppError(`File already exists: '${real}'`, 409);
      }
      await host.writeFile(real, args.content, enc(args.encoding));
      return { path: real };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_update_file',
      'state_changing',
      'Overwrite or append to an EXISTING file inside an allowed folder. args: { path: string, ' +
        'content: string, mode?: "overwrite"|"append" (default "overwrite"), encoding?: "utf8"|"base64" } ' +
        '— returns { path }.',
    ),
    inputSchema: UpdateFileArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      if (!(await host.exists(real))) {
        throw new AppError(`File not found: '${real}'`, 404);
      }
      const encoding = enc(args.encoding);
      if (args.mode === 'append') await host.appendFile(real, args.content, encoding);
      else await host.writeFile(real, args.content, encoding);
      return { path: real };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_create_directory',
      'state_changing',
      'Create a directory (and any missing parents) inside an allowed folder. args: { path: string } ' +
        '— returns { path }.',
      { requiresIdempotencyKey: true },
    ),
    inputSchema: MkdirArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      await host.mkdir(real);
      return { path: real };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_create_copy',
      'state_changing',
      'Copy a file. BOTH source and destination must be inside allowed folders. args: { from: string, ' +
        'to: string } — returns { from, to }.',
      { requiresIdempotencyKey: true },
    ),
    inputSchema: CopyArgs,
    handler: async (args) => {
      const from = await guard(args.from);
      const to = await guard(args.to);
      await host.copyFile(from, to);
      return { from, to };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_update_location',
      'state_changing',
      'Move or rename a file/directory. BOTH source and destination must be inside allowed folders. ' +
        'args: { from: string, to: string } — returns { from, to }.',
    ),
    inputSchema: MoveArgs,
    handler: async (args) => {
      const from = await guard(args.from);
      const to = await guard(args.to);
      await host.rename(from, to);
      return { from, to };
    },
  });

  // --- Destructive ---

  CapabilityRegistry.register({
    descriptor: descriptor(
      'file_delete_entry',
      'destructive',
      'Delete a file or directory inside an allowed folder. args: { path: string, recursive?: boolean ' +
        '(required to delete a non-empty directory) } — returns { path }.',
    ),
    inputSchema: DeleteArgs,
    handler: async (args) => {
      const real = await guard(args.path);
      await host.remove(real, args.recursive ?? false);
      return { path: real };
    },
  });

  // --- Grant management (the AI requests; the confirm handler shows a user-consent modal). ---

  CapabilityRegistry.register({
    descriptor: descriptor(
      'fileaccess_list_grants',
      'read',
      'List the folders the agent is allowed to operate in. args: {} — returns an array of ' +
        '{ path, mode: "read"|"read-write"|"full", recursive }.',
    ),
    inputSchema: NoArgs,
    handler: () => grants.list(),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'fileaccess_create_grant',
      'destructive',
      'REQUEST that a folder be added to the allowed list (the user must approve). args: { path: string, ' +
        'mode?: "read"|"read-write"|"full" (default "read"), recursive?: boolean (default true) } — ' +
        'returns the stored grant. Use this when a needed path is outside every allowed folder.',
      { requiresIdempotencyKey: true },
    ),
    inputSchema: CreateGrantArgs,
    handler: async (args) => {
      const real = await host.canonicalize(args.path);
      const grant = { path: real, mode: args.mode ?? 'read', recursive: args.recursive ?? true };
      await grants.add(grant);
      return grant;
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'fileaccess_update_grant',
      'state_changing',
      'REQUEST a change to an existing folder grant (the user must approve). args: { path: string, ' +
        'mode?: "read"|"read-write"|"full", recursive?: boolean } — returns { path }.',
    ),
    inputSchema: UpdateGrantArgs,
    handler: async (args) => {
      const real = await host.canonicalize(args.path);
      const patch: { mode?: FileAccessMode; recursive?: boolean } = {};
      if (args.mode !== undefined) patch.mode = args.mode;
      if (args.recursive !== undefined) patch.recursive = args.recursive;
      await grants.update(real, patch);
      return { path: real };
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'fileaccess_delete_grant',
      'state_changing',
      'REQUEST removal of a folder grant (the user must approve). args: { path: string } — returns ' +
        '{ path }. The folder is no longer accessible afterward.',
    ),
    inputSchema: DeleteGrantArgs,
    handler: async (args) => {
      const real = await host.canonicalize(args.path);
      await grants.remove(real);
      return { path: real };
    },
  });
}
