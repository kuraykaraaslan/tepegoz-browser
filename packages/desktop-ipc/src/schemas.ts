/**
 * Runtime (zod) validation for IPC payloads — MAIN PROCESS ONLY. Kept separate from `ipc-contract.ts`
 * so the sandboxed preload never pulls zod into its bundle (sandboxed preloads can't require external
 * modules at runtime). Validates the UNTRUSTED direction: inputs arriving from the renderer.
 *
 * The schemas are grouped by domain into `schemas-<domain>.ts` siblings (ADR-0010's file cap); this
 * facade re-exports them so every existing `@tepegoz/desktop-ipc/schemas` import keeps resolving.
 */
export * from './schemas-app';
export * from './schemas-tabs';
export * from './schemas-network';
export * from './schemas-agent';
export * from './schemas-bookmarks';
export * from './schemas-extensions';
export * from './schemas-ui';
export * from './schemas-logins';
export * from './schemas-macros';

export { DownloadCommandInputSchema, DownloadCreateInputSchema } from '@tepegoz/downloads/schemas';
export { UploadCommandInputSchema, UploadCreateInputSchema } from '@tepegoz/uploads/schemas';
export {
  TaskCommandInputSchema,
  TaskDefinitionSchema,
  TaskSaveInputSchema,
} from '@tepegoz/tasks/schemas';
export {
  AgentConversationIdSchema,
  AgentConversationListInputSchema,
  AgentConversationOpenInputSchema,
} from '@tepegoz/ext-agent/history-schemas';
export {
  ClipboardOperationInputSchema,
  ClipboardReadTextInputSchema,
  ClipboardWriteTextInputSchema,
} from '@tepegoz/clipboard/schemas';
