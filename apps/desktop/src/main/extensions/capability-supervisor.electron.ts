import { AppError, Logger } from '@tepegoz/libs';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import {
  ExtensionCapabilitySupervisor,
  extensionManagementCapabilities,
  EXTENSION_HOST_ID,
  type ExtensionInfo,
  type ExtensionManagementHost,
} from '@tepegoz/extension-host';
import type { ExtensionCapabilitySet } from '@tepegoz/extension-sdk';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';
import { BUILTIN_MANIFESTS, extensionLabel, manifestById } from '../../shared/extensions';
import { mainLocale } from '../lib/i18n-main';

/**
 * Main-process wiring for the in-process extension capability plane (ADR-0021). Mirrors
 * `mcp/supervisor.electron.ts`: it wires the Electron/store concretions (CapabilityRegistry adapter +
 * prefs-backed enabled check + the ExtensionManagementHost) into the Electron-free
 * `ExtensionCapabilitySupervisor`, so an ENABLED built-in extension's capabilities register into the
 * single registry behind the ToolGateway PEP, and unregister on disable.
 *
 * Extensions contribute their capability set + concrete host via {@link provide} at startup, THEN
 * {@link start} provides the always-on meta extension-management tools and runs the initial reconcile.
 */

/** extensionId → the capability ids it contributes (for the management host's ExtensionInfo). */
const capabilityIdsByExtension = new Map<string, readonly string[]>();

function currentExtensions() {
  return PreferenceStore.getAll().extensions;
}

function infoFor(id: string): ExtensionInfo | undefined {
  const manifest = manifestById(id);
  if (manifest === undefined) return undefined;
  return {
    id: manifest.id,
    name: extensionLabel(manifest, mainLocale()).name,
    version: manifest.version,
    enabled: isExtensionEnabled(currentExtensions(), manifest.id),
    permissions: manifest.permissions,
    capabilities: capabilityIdsByExtension.get(manifest.id) ?? [],
  };
}

const managementHost: ExtensionManagementHost = {
  list: () =>
    BUILTIN_MANIFESTS.map((m) => infoFor(m.id)).filter((i): i is ExtensionInfo => i !== undefined),
  get: (id) => infoFor(id),
  setEnabled: (id, enabled) => {
    const manifest = manifestById(id);
    if (manifest === undefined) throw new AppError(`Unknown extension: ${id}`, 404);
    const status = enabled ? 'enabled' : 'disabled';
    const others = currentExtensions().filter((e) => e.id !== id);
    PreferenceStore.update({ extensions: [...others, { id, status }] });
    supervisor.reconcile();
    const info = infoFor(id);
    if (info === undefined) throw new AppError(`Unknown extension: ${id}`, 404);
    return info;
  },
};

const supervisor = new ExtensionCapabilitySupervisor({
  registry: {
    register: (tool) => {
      CapabilityRegistry.register(tool);
    },
    unregister: (toolId) => CapabilityRegistry.unregister(toolId),
    has: (toolId) => CapabilityRegistry.get(toolId) !== undefined,
  },
  // The reserved host id is always on so the agent can always discover/manage extensions.
  isEnabled: (extId) => extId === EXTENSION_HOST_ID || isExtensionEnabled(currentExtensions(), extId),
  log: (msg, meta) => {
    Logger.info(msg, meta);
  },
});

let started = false;

const ExtensionCapabilityService = {
  /** Register an extension's capability set + concrete host. Call BEFORE {@link start}. */
  provide<H>(set: ExtensionCapabilitySet<H>, host: H): void {
    capabilityIdsByExtension.set(
      set.extensionId,
      set.capabilities.map((c) => c.descriptor.id),
    );
    supervisor.provide(set, host);
  },

  /** Provide the always-on meta capabilities and run the initial reconcile. Safe/no-op if re-called. */
  start(): void {
    if (started) return;
    started = true;
    supervisor.provide(extensionManagementCapabilities(), managementHost);
    supervisor.reconcile();
  },

  /** Re-sync the registered set to the current enabled set (call after a prefs/extensions change). */
  reconcile(): void {
    supervisor.reconcile();
  },
};

export default ExtensionCapabilityService;
