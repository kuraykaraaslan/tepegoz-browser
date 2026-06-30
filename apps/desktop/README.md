# @tepegoz/desktop (L0)

The Electron application shell. **3-process model:** untrusted renderer (UI only) · privileged main ·
a single typed `contextBridge` preload. See ADR-0001.

## Structure
```
src/main/      # app lifecycle, secure createWindow() factory, deny-by-default security, typed IPC
src/preload/   # contextBridge → window.tepegoz (no raw ipcRenderer)
src/renderer/  # React + @tepegoz/i18n UI
src/shared/    # ipc-contract (dependency-free) + ipc-schemas (zod, main-only)
electron.vite.config.ts  # main/preload/renderer build; workspace pkgs bundled; preload = CJS
```

## Run
```sh
pnpm dev        # GUI dev (clears ELECTRON_RUN_AS_NODE via scripts/dev.mjs); HMR
pnpm build      # electron-vite build → out/
pnpm typecheck  # tsc node (no DOM) + web (DOM) — enforces main/renderer separation
```

## Security defaults (BLOCKING)
contextIsolation + sandbox + nodeIntegration:false + webSecurity:true; `will-navigate` /
`setWindowOpenHandler` / permission handler deny-by-default; secrets only in main via `safeStorage`.
Electron fuses + strict prod CSP via headers = Phase 0/1a follow-ups (see `docs/known-issues.md`).
