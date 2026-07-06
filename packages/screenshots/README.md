# @tepegoz/screenshots

Electron-free screenshot domain package for browser visual fallback. It owns public screenshot types,
main-only zod schemas, model-safe metadata wrapping, and the `browser_get_screenshot` Capability Plane
tool registration. The desktop app owns the concrete Electron `webContents.capturePage` adapter.
