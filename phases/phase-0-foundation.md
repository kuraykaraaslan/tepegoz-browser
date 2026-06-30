# Phase 0 — Foundation Scaffold & Core Contracts

**Status:** 🟡 In progress  ·  **Estimate:** ~6–8 weeks  ·  **Depends on:** none (start)
**Goal:** The type-safe, modular, compliant backbone everything sits on + immutable cross-layer contracts.
No product features; the decisions made here would force a full rewrite if wrong.
**Branch:** `chore/scaffold`

## Exit criteria (DoD)
- [ ] `pnpm install --frozen-lockfile && turbo run lint typecheck test build` passes clean
- [ ] CI per-OS matrix (windows/macos/ubuntu) green; native modules rebuilt on each runner
- [ ] shared-types zod contracts + sample round-trip tests exist
- [ ] Secure `createWindow()` factory + fuses + typed IPC skeleton opens a working empty window
- [ ] Threat Model Lite + Risk Register + ~9 ADRs + READMEs + CHANGELOG written
- [ ] Windows code-signing identity acquisition started (BLOCKING for distribution)

## Tasks

### Repo & Git & compliance
- [x] `git init`; `chore/scaffold` branch; `.gitignore` (node_modules, dist, out, .env, *.node build)
- [ ] when origin remote added → **SSH** (`git@github.com:...`) — never HTTPS
- [ ] **commit/PR template: NO AI attribution trailer**; optional commit-msg lint (reject AI trailer)
- [ ] First project-root `CLAUDE.md`: branch-based workflow + AI-trailer ban + stack summary

### Monorepo & build
- [x] `pnpm-workspace.yaml` (apps/*, packages/*)
- [x] root `package.json` + `turbo.json` (lint/typecheck/test/build pipeline, cache) — **turbo pinned to `2.5.5`** (2.10.1 crashes on this machine: `STATUS_DLL_NOT_FOUND`)
- [x] root base `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, Bundler resolution, paths `@/*`) — all packages extend  _(dropped `ignoreDeprecations`: invalid on TS 5.7 + unneeded with Bundler resolution)_
- [x] `eslint.config.mjs` (flat config; typescript-eslint strict **type-checked** + `no-floating-promises`) + `.prettierrc.json` + `.editorconfig`
- [x] `dependency-cruiser.cjs` — no-circular + no-orphans + not-to-dev-dep (concrete L-layer rules added when those packages land)
- [ ] `electron.vite.config.ts` (main/preload/renderer 3 targets) — **plain Vite FORBIDDEN**
- [ ] `electron-builder.yml` (Windows NSIS, appId `com.tepegoz.browser` **frozen**, fuses block, `asarUnpack: ['**/*.node']`, `electron-updater`)

### shared-types (single source of truth)
- [x] `packages/shared-types` — zod schemas: `EventSchema` (+`blobRef` cas://), `ToolDescriptorSchema` (+`ToolNameSchema` {domain}_{verb}_{noun}), `ToolErrorSchema` envelope. _(SessionSchema, DAG-plan, checkpoint, CanonRequest/Event, PolicyIR, ContextPackage land in Phase 1a/1b as those layers arrive.)_
- [x] `z.enum` enums: `AIProviderEnum`, `PolicyDecisionEnum`, `HITLStatusEnum`, `EventTypeEnum`, `RiskLevelEnum`, `McpTransportEnum`, `ToolSourceEnum`, `ToolErrorCodeEnum`
- [x] consumer packages use `z.infer` (no schema copying) — round-trip test (`src/index.test.ts`, 4 tests green)

### libs (infrastructure)
- [x] `libs/app-error.ts` — `AppError(message, statusCode)` + `toBoundary()` mapping helper (unknown → 500)
- [x] `libs/env.ts` — `EnvSchema.parse(process.env)` startup-crash (SQLITE_PATH/MCP port/policy default/optional proxy; all optional → BYO keys are NOT env)
- [x] `libs/logger` — static class + **secret/PII redaction** (Anthropic/OpenAI/Google keys, bearer, JWT) — Journal + Console reuse `Logger.redact`
- [x] `libs/messages.ts` — constant operator/log messages (no inline throw strings)

### core-shell (L0) skeleton
- [ ] single `createWindow()` factory (contextIsolation/sandbox/nodeIntegration:false/webSecurity:true)
- [ ] Electron fuses (runAsNode=false, onlyLoadAppFromAsar, asar integrity, cookie encryption)
- [ ] launch with `--use-system-ca`; power-monitor resume hook skeleton; per-profile partition isolation
- [ ] preload: typed `contextBridge`; NO raw `ipcRenderer` exposed; `src/shared/*.contract.ts` IPC channel registry (each handler validates payload-zod + sender allow-list)

### persistence + Event Journal (L1)
- [ ] `packages/persistence` — better-sqlite3 (WAL, `synchronous=NORMAL`)
- [ ] append-only `events` table + reducer/projector skeleton
- [ ] content-addressed blob store (SHA-256 + WebP); **base64 never in transcript** rule baked into code
- [ ] migration infra + **day-0 sync-meta** (`updated_at`, `vector_clock`, `tombstone`) + device-scope
- [ ] integration test harness (better-sqlite3)

### native & workers (skeleton)
- [ ] `packages/native-rs` (napi-rs) placeholder (egress/screenshot/checkpoint/SLM bridge) — **egress in TS for MVP**
- [ ] `src/workers/` utilityProcess skeleton (deferred init after ready-to-show)

### CI/CD
- [ ] `.github/workflows/ci.yml` — PR: frozen-lockfile install → lint → typecheck → test → build (unsigned)
- [ ] coverage gate (S80/B70/F80/L80) + reject focused/skipped tests + AI-trailer commit lint + `pnpm audit`
- [ ] `.github/workflows/release.yml` — tag-driven **per-OS matrix** (fail-fast:false), `install-app-deps` native rebuild, signing step skeleton
- [ ] Start Windows code-signing identity (Azure Trusted Signing / EV) — **BLOCKING (distribution)**

### Documentation & security
- [ ] root + per-package `README.md` (purpose/stack/setup/env/scripts/structure)
- [ ] `docs/adr/` ~9 ADRs: Electron+React+TS · SQLite(FTS5+sqlite-vec) · event-sourced Journal · provider-agnostic AI + failure-story · CDP automation · Policy Kernel+HITL · L5 separate process · MCP convention · boundary-mapping (HTTP→IPC)
- [ ] `CHANGELOG.md` (Keep-a-Changelog: Added/Changed/Fixed/Security/Operational) + `docs/known-issues.md` + `handover/` skeleton
- [x] `.env.example` (key names only, no values; explicit "BYO keys live in OS keychain, not here")
- [ ] **Threat Model Lite + Risk Register** (tepegoz = High/Critical; trust boundaries: renderer/isolated-webview/main/CDP/MCP-client/MCP-server/AI-provider/adapter/OAuth)

### i18n infrastructure (DAY-0 — set up early to avoid pain later)
- [ ] choose + set up i18n library (e.g. i18next/react-i18next or a lightweight type-safe solution; Electron renderer, no SSR) — **ADR**
- [x] `packages/i18n` locale bundle: `src/locales/en.ts` (**primary/source; fallback**) + `tr.ts` (full parity, first-class); namespaced (common, commandPalette, agentConsole, onboarding, errors) + `resolveLocale()`
- [x] type-safe keys: `Resources = typeof en` contract → any missing/mismatched key in `tr` is a **build error** (verified)
- [ ] **"no hardcoded user-facing string" ESLint rule** (e.g. eslint-plugin-i18next/no-literal-string); allow-list exception: logs/`*.messages.ts`/tests
- [ ] locale-aware formatting (date/number/plural/relative-time) + RTL-ready skeleton
- [ ] main-process user-facing text (native menu, dialog, notification, tray) reads from i18n (same catalog as renderer)
- [ ] language selection: OS language default + override in settings; runtime language switch (no restart)
- [ ] Turkish IME/keyboard pipeline skeleton (ç/ğ/ı/ö/ş/ü, Turkish-Q/F, dead keys) — regression matrix filled in Phase 1a

### Test infrastructure
- [x] Vitest (unit/integration) setup + sample tests (7 tests green across shared-types + libs)
- [ ] Playwright `_electron` (E2E) skeleton (Spectron forbidden)
- [x] i18n integrity test: `en` and `tr` key sets equal + `resolveLocale` fallback (3 tests green)
