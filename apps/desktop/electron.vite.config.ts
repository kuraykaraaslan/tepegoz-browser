import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Workspace packages expose TS source via their `exports`; they must be BUNDLED into main/preload
// (not externalized) — otherwise Node would try to load their `./src/index.ts` at runtime and fail
// with ERR_UNKNOWN_FILE_EXTENSION. Real npm deps (electron, zod, @anthropic-ai/sdk, …) stay external.
const WORKSPACE_PACKAGES = [
  '@tepegoz/shared-types',
  '@tepegoz/libs',
  '@tepegoz/i18n',
  '@tepegoz/model-gateway',
  '@tepegoz/orchestrator',
  '@tepegoz/capability-plane',
  '@tepegoz/security-policy',
  '@tepegoz/tool-executor',
  '@tepegoz/browser-tools',
  '@tepegoz/tab-engine',
  '@tepegoz/journal-tools',
  '@tepegoz/navigation',
  // Reader: main imports the article MODEL (types + limits) to re-validate what the injected
  // extractor sends back. The extractor itself is a committed bundled string, not an import.
  '@tepegoz/reader',
  // The one keyboard-shortcut registry — main matches `before-input-event` against it.
  '@tepegoz/shortcuts',
  '@tepegoz/json-store',
  '@tepegoz/credential-vault',
  '@tepegoz/preferences',
  // The typed IPC contract. Its `.` entry is zod-free so the sandboxed preload bundles it safely;
  // the zod validators live in the `@tepegoz/desktop-ipc/schemas` entry (imported by main only).
  '@tepegoz/desktop-ipc',
  // Extension SDK + the catalog loader: main reads the generated `extensions.catalog.json` for id
  // validation, `tepegoz://` page routing, and native-menu labels (via shared/extensions.ts). Only the
  // React-free loader is reached from main; the renderer bundles the surface components separately.
  '@tepegoz/extension-sdk',
  '@tepegoz/extension-catalog',
  '@tepegoz/ext-adblock',
  '@tepegoz/ext-agent',
  '@tepegoz/ext-user-agent',
  '@tepegoz/ext-popup-blocker',
  '@tepegoz/ext-macros',
  '@tepegoz/ext-translate',
  '@tepegoz/ext-typo',
  '@tepegoz/ext-video-player',
  // Bundled into main (TS source). Its database is `node:sqlite`, a built-in module — nothing native
  // to keep external and nothing to rebuild.
  '@tepegoz/persistence',
];

// electron-vite conventions: main = src/main/index.ts, preload = src/preload/index.ts,
// renderer root = src/renderer (index.html). Output goes to out/.
export default defineConfig(({ command }) => {
  const nodeEnv = process.env['NODE_ENV'] ?? (command === 'serve' ? 'development' : 'production');

  return {
    main: {
      plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    },
    preload: {
      plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
      // Force CJS single-file preload (sandbox:true requires CJS) at a stable path matching window.ts.
      build: {
        rollupOptions: {
          output: { format: 'cjs', entryFileNames: 'index.js' },
        },
      },
    },
    renderer: {
      define: {
        __TEPEGOZ_NODE_ENV__: JSON.stringify(nodeEnv),
      },
      plugins: [react(), tailwindcss()],
    },
  };
});
