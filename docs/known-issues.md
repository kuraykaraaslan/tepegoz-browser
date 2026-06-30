# Known Issues & Workarounds

| Issue | Severity | Status / Workaround |
|---|---|---|
| `turbo` 2.10.1 crashes on Windows (`STATUS_DLL_NOT_FOUND` / 0xC0000135) | High | **Pinned to 2.5.5.** Revisit when a working newer release is confirmed. |
| `ELECTRON_RUN_AS_NODE=1` in some shells makes Electron run as Node (no GUI) | High | `pnpm dev` uses `apps/desktop/scripts/dev.mjs`, which deletes the var before launching. |
| Dev CSP is relaxed (no meta CSP) for Vite/React-Refresh inline preamble | Medium | **TODO (Phase 1a):** set strict CSP via session response headers in main (dev-relaxed, prod-strict). |
| Coverage thresholds (S80/B70/F80/L80) not yet enforced in CI | Medium | Deferred until substantive logic lands (Phase 1a); tests run, thresholds added later. |
| Code signing not configured | High (distribution) | **BLOCKING for release.** Acquire Windows Authenticode / Azure Trusted Signing identity (user action). Unsigned builds are dev-only. |
| `sqlite-vec` is brute-force (no ANN index) | Medium | Fine at small scale; per-task GB-scale memory switches to a real ANN index above a measured threshold (Phase 1b). |
| Chrome extension (MV3) support | Low (now) | Partial, planned for Phase 3 (limited allowlist); full parity is a Phase 4 decision. Not promised. |
