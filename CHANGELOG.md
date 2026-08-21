# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project uses [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Phase 0 foundation: pnpm + Turborepo monorepo, strict TypeScript, ESLint (flat, type-checked),
  Prettier, dependency-cruiser.
- `@tepegoz/shared-types` — zod contracts (Event Journal, ToolDescriptor/ToolName, error envelope, enums).
- `@tepegoz/libs` — `AppError` + boundary mapping, `env` (zod startup), `Logger` (secret/PII redaction).
- `@tepegoz/i18n` — English-first + Turkish locale catalog with type-safe keys + integrity test.
- `@tepegoz/persistence` (L1) — better-sqlite3 Event Journal, content-addressed blob store, forward-only
  migrations, day-0 sync-meta.
- `@tepegoz/desktop` (L0) — Electron app: secure window factory, deny-by-default hardening, typed
  contextBridge IPC, single-instance lock, React + i18n renderer; runs as a GUI via `pnpm dev`.
- CI (GitHub Actions): verify (frozen-lockfile · turbo typecheck/lint/test/build · audit) +
  AI-trailer commit-policy; tag-driven per-OS release matrix skeleton.
- ADRs 0001–0010, Threat Model Lite, known-issues, handover skeleton.

### Security

- Renderer treated as untrusted (contextIsolation/sandbox/nodeIntegration:false/webSecurity:true);
  BYO keys stored only in the main process via `safeStorage`; logs/journal redaction.

### Operational

- `turbo` pinned to 2.5.5 (2.10.1 crashes on Windows). Dev launcher clears `ELECTRON_RUN_AS_NODE`.
