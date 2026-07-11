/**
 * Internal "extensions" wire types for the desktop IPC contract — built-in feature panels registered
 * under one uniform model (the foundation for the extension system; real MV3/third-party extensions
 * remain a later phase). Each opens as a chrome-rendered panel over the content area. The Agent is the
 * first; add ids here as more land.
 */
// Extension manifest identity comes from the SDK schema (single source). Type-only → erased, so the
// sandboxed preload stays dependency-free (the SDK pulls in zod). See `ExtensionManifestWire` below.
import type { ExtensionManifest } from '@tepegoz/extension-sdk';

/** Reverse-DNS extension id (e.g. "com.tepegoz.agent"). The built-in registry (shared/extensions.ts)
 *  is the source of truth for which ids exist — kept out of this preload-safe file (it pulls in zod). */
export type ExtensionId = string;

/** The renderer-facing extension manifest: IDENTITY only. Omits `mcpServer` (agent/main-only). Delivered
 *  by `listExtensionManifests`; the renderer pairs each with its lazily-loaded surface components + icon
 *  (enabled/disabled state comes separately from prefs — {@link ExtensionState}). */
export type ExtensionManifestWire = Omit<ExtensionManifest, 'mcpServer'>;

/** Per-extension status (managed at tepegoz://extensions). More states (e.g. 'error') may be added. */
export type ExtensionStatus = 'enabled' | 'disabled';

/** The action chosen from a toolbar extension icon's right-click menu: open its settings page, or
 *  remove (disable) it. */
export type ExtensionContextMenuAction = 'page' | 'remove';
export interface ExtensionContextMenuChoice {
  id: ExtensionId;
  action: ExtensionContextMenuAction;
}
export interface ExtensionState {
  id: ExtensionId;
  status: ExtensionStatus;
}

/** An extension's status from the persisted list (defaults to 'enabled' when not listed). */
export function extensionStatus(
  extensions: readonly ExtensionState[],
  id: ExtensionId,
): ExtensionStatus {
  return extensions.find((e) => e.id === id)?.status ?? 'enabled';
}

export function isExtensionEnabled(
  extensions: readonly ExtensionState[],
  id: ExtensionId,
): boolean {
  return extensionStatus(extensions, id) !== 'disabled';
}
