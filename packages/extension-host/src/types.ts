import type { RegisteredTool } from '@tepegoz/capability-plane';

/**
 * Minimal port over the single `CapabilityRegistry` so the supervisor stays Electron- and
 * app-free and unit-testable. The main process supplies an adapter over the real registry.
 */
export interface CapabilityRegistryPort {
  register(tool: RegisteredTool): void;
  unregister(id: string): boolean;
  has(id: string): boolean;
}

/** One extension's identity + state, as the agent's extension-management meta-tools expose it. */
export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  permissions: readonly string[];
  /** Ids of the agent-callable capabilities this extension contributes (may be empty). */
  capabilities: readonly string[];
}

/**
 * Host seam for the meta extension-management capabilities (implemented by the main process over
 * `PreferenceStore` + `BUILTIN_MANIFESTS`). Kept here so `@tepegoz/extension-host` stays Electron-free.
 */
export interface ExtensionManagementHost {
  list(): ExtensionInfo[];
  get(id: string): ExtensionInfo | undefined;
  /** Enable/disable an extension; returns the updated info. Throws (AppError) on an unknown id. */
  setEnabled(id: string, enabled: boolean): ExtensionInfo;
}
