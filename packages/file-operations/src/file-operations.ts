import { z } from 'zod';
import { AppError } from '@tepegoz/libs';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import { FILE_ACCESS_MODES, type FileAccessMode } from '@tepegoz/shared-types/file-access';
import type { FileEncoding, FileSystemHost, GrantStore } from './fs-host';
import type { FileAccessPolicy } from './file-access-policy';

/**
 * Built-in file tools (domain `file` for operations, `fileaccess` for grant management). Each registers
 * as a uniform ToolDescriptor + zod validator + handler and is reached ONLY through the ToolGateway PEP.
 * Names follow `{domain}_{verb}_{noun}` with an approved verb; the argument shape is described in the
 * text so the planner (which sees only id/dangerClass/description) can produce valid args.
 *
 * The concrete filesystem + grant persistence are injected via {@link FileSystemHost} / {@link GrantStore},
 * so this package stays Electron- and `node:fs`-free. Every handler canonicalizes the untrusted path and
 * asserts it is inside a grant (the hard sandbox) before doing anything; the per-op MODE gate (auto vs
 * prompt) lives in the ToolGateway confirm handler via {@link FileAccessPolicy.decide} (see
 * {@link FILE_OP_REQUIRED_MODE}). Read tools are `read` (auto-allowed by policy — membership is enforced
 * in the handler); writes are `state_changing`, deletes `destructive` (→ HITL).
 */
export interface FileOperationsDeps {
  host: FileSystemHost;
  policy: FileAccessPolicy;
  grants: GrantStore;
}

/** The minimum grant mode each mutating file op requires — consumed by the confirm handler's mode gate.
 *  Read tools are absent (they never escalate; membership alone gates them). */
export const FILE_OP_REQUIRED_MODE: Readonly<Record<string, FileAccessMode>> = {
  file_create_file: 'read-write',
  file_update_file: 'read-write',
  file_create_directory: 'read-write',
  file_create_copy: 'read-write',
  file_update_location: 'read-write',
  file_delete_entry: 'full',
};

/** The grant-management tools the AI drives — always user-consented (never auto), handled by the
 *  confirm handler. Exposed so the main process can special-case them in one place. */
export const FILE_GRANT_TOOL_IDS = [
  'fileaccess_create_grant',
  'fileaccess_update_grant',
  'fileaccess_delete_grant',
] as const;

const PathArg = z.string().min(1).max(4096);
const EncodingArg = z.enum(['utf8', 'base64']);
const ContentArg = z.string().max(5_000_000);

const ReadFileArgs = z.object({ path: PathArg, encoding: EncodingArg.optional() });
const ListArgs = z.object({ path: PathArg });
const MetaArgs = z.object({ path: PathArg });
const SearchArgs = z.object({
  path: PathArg,
  pattern: z.string().min(1).max(256),
  limit: z.number().int().positive().max(1000).optional(),
});
const CreateFileArgs = z.object({ path: PathArg, content: ContentArg, encoding: EncodingArg.optional() });
const UpdateFileArgs = z.object({
  path: PathArg,
  content: ContentArg,
  mode: z.enum(['overwrite', 'append']).optional(),
  encoding: EncodingArg.optional(),
});
const MkdirArgs = z.object({ path: PathArg });
const CopyArgs = z.object({ from: PathArg, to: PathArg });
const MoveArgs = z.object({ from: PathArg, to: PathArg });
const DeleteArgs = z.object({ path: PathArg, recursive: z.boolean().optional() });
const NoArgs = z.object({}).strip();
const CreateGrantArgs = z.object({
  path: PathArg,
  mode: z.enum(FILE_ACCESS_MODES).optional(),
  recursive: z.boolean().optional(),
});
const UpdateGrantArgs = z.object({
  path: PathArg,
  mode: z.enum(FILE_ACCESS_MODES).optional(),
  recursive: z.boolean().optional(),
});
const DeleteGrantArgs = z.object({ path: PathArg });

function descriptor(
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

let registered = false;

/** Idempotent: register the file tools exactly once into the CapabilityRegistry. */
export function registerFileOperations(deps: FileOperationsDeps): void {
  if (registered) return;
  registered = true;

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

/** Test seam: allow re-registration after CapabilityRegistry.reset(). */
export function resetFileOperationsForTest(): void {
  registered = false;
}
