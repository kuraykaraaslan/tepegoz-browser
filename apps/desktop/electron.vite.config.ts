import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// electron-vite conventions: main = src/main/index.ts, preload = src/preload/index.ts,
// renderer root = src/renderer (index.html). Output goes to out/.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // Force CJS single-file preload (sandbox:true requires CJS) at a stable path matching window.ts.
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
