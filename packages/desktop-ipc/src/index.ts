/**
 * `@tepegoz/desktop-ipc` — the typed IPC contract shared by the desktop app's main, preload and
 * renderer. This entry (`.`) is dependency-free (no zod) so the sandboxed preload can import it;
 * the runtime zod validators live in the separate `@tepegoz/desktop-ipc/schemas` entry (main-process
 * only). Extracted from `apps/desktop/src/shared` per docs/package-map.md.
 */
export * from './contract';
