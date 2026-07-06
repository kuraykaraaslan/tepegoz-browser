import type { FileAccessMode } from '@tepegoz/shared-types/file-access';
import type { FileSystemHost, GrantStore } from './fs-host';
import type { FileAccessPolicy } from './file-access-policy';
import { registerFileTools } from './file-operations-tools';

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
 *
 * The per-tool ToolDescriptor building/registration lives in `./file-operations-tools`; the argument
 * zod schemas live in `./file-operations-schemas` (ADR-0010 250-line cap).
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

let registered = false;

/** Idempotent: register the file tools exactly once into the CapabilityRegistry. */
export function registerFileOperations(deps: FileOperationsDeps): void {
  if (registered) return;
  registered = true;

  registerFileTools(deps);
}

/** Test seam: allow re-registration after CapabilityRegistry.reset(). */
export function resetFileOperationsForTest(): void {
  registered = false;
}
