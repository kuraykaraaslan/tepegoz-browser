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
  '@tepegoz/navigation',
  '@tepegoz/json-store',
  '@tepegoz/credential-vault',
  // Extension SDK + built-in extension manifests: main reads them for id validation, `tepegoz://`
  // page routing, and native-menu labels (via shared/extensions.ts). Only the React-free manifest
  // modules are reached from main; the renderer bundles the surface components separately.
  '@tepegoz/extension-sdk',
  '@tepegoz/ext-agent',
  '@tepegoz/ext-user-agent',
  // Bundled into main (TS source). Its native dep `better-sqlite3` stays external (real npm module,
  // rebuilt against the Electron ABI via `pnpm --filter @tepegoz/desktop run rebuild`).
  '@tepegoz/persistence',
];

// electron-vite conventions: main = src/main/index.ts, preload = src/preload/index.ts,
// renderer root = src/renderer (index.html). Output goes to out/.
export default defineConfig({
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
    plugins: [react(), tailwindcss()],
  },
});
