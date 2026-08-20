/**
 * Typed IPC contract (internal-ai-rules / electron-desktop-security): the preload exposes ONLY a
 * small, named, typed API — never raw ipcRenderer. Channels are named `domain:action`.
 *
 * NOTE: this file is imported by the SANDBOXED preload, so it must stay dependency-free (no zod —
 * a sandboxed preload cannot `require` external npm modules). Runtime schemas live in `ipc-schemas.ts`
 * and `main/preferences/preferences.model.ts` (main-process only).
 *
 * Agent wire types come from the isolated Agent extension package (its public contract). Type-only,
 * so the sandboxed preload stays dependency-free.
 *
 * This module is a facade: the contract's own wire types are split into `contract-<domain>.ts` siblings
 * (each under ADR-0010's 250-line cap) and re-exported here so `@tepegoz/desktop-ipc` consumers keep
 * the single import surface they already rely on.
 */
export * from './contract-ext-settings';
export * from './contract-shared-types';
export * from './contract-bookmarks';
export * from './contract-extensions';
export * from './contract-credentials';
export * from './contract-page-menu';
export * from './contract-app';

// Channel names + internal page addresses live in channels.ts (250-line cap); re-exported here so
// `@tepegoz/desktop-ipc` consumers keep one import surface.
export * from './channels';

// The public-settings allowlist + shape (extension-facing curated preferences). Zod-free.
export * from './public-settings';

// Preferences, tab/tab-group wire types, AIAdaptor wire types, and the TepegozApi surface itself are
// each split into their own file (ADR-0010's 250-line cap); re-exported here for the single import
// surface `@tepegoz/desktop-ipc` consumers already rely on.
export * from './preferences-types';
export * from './tabs-types';
export * from './ai-adaptor-types';
export * from './api';
export * from './api-network';
