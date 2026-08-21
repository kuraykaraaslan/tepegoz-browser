# Phase 0 — Foundation Scaffold & Core Contracts

**Status:** 🟡 In progress · **Estimate:** ~6–8 weeks · **Depends on:** none (start)
**Goal:** The type-safe, modular, compliant backbone everything sits on + immutable cross-layer contracts.
No product features; the decisions made here would force a full rewrite if wrong.
**Branch:** `chore/scaffold`

## Exit criteria (DoD)

- [ ] `pnpm install --frozen-lockfile && turbo run lint typecheck test build` passes clean
- [ ] CI per-OS matrix (windows/macos/ubuntu) green; native modules rebuilt on each runner
- [ ] shared-types zod contracts + sample round-trip tests exist
- [ ] Secure `createWindow()` factory + fuses + typed IPC skeleton opens a working empty window
- [x] Threat Model Lite + Risk Register + ~9 ADRs + READMEs + CHANGELOG written
- [ ] Windows code-signing identity — _**permanently deferred to the production gate** (ship-line decision, 2026-08-21). NOT a v1 blocker and NOT part of this DoD; v1 builds, CI, e2e and UAT all run unsigned._
- [ ] Release & update hardening designed (auto-update + signed rollback + crashReporter + safe-mode + corrupt-profile recovery) — _runtime flow activated before first public release_

## Tasks

### Repo & Git & compliance

- [x] `git init`; `chore/scaffold` branch; `.gitignore` (node_modules, dist, out, .env, *.node build)
- [x] origin remote is **SSH** (`git@github.com:kuraykaraaslan/tepegoz-browser.git`) — never HTTPS
- [x] **NO AI attribution trailer** in commits/PRs — enforced by CI `commit-policy` job _(local commit-msg hook optional)_
- [x] First project-root `CLAUDE.md`: branch-based workflow + AI-trailer ban + stack summary

### Monorepo & build

- [x] `pnpm-workspace.yaml` (apps/_, packages/_)
- [x] root `package.json` + `turbo.json` (lint/typecheck/test/build pipeline, cache) — **turbo pinned to `2.5.5`** (2.10.1 crashes on this machine: `STATUS_DLL_NOT_FOUND`)
- [x] root base `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, Bundler resolution, paths `@/*`) — all packages extend _(dropped `ignoreDeprecations`: invalid on TS 5.7 + unneeded with Bundler resolution)_
- [x] `eslint.config.mjs` (flat config; typescript-eslint strict **type-checked** + `no-floating-promises`) + `.prettierrc.json` + `.editorconfig`
- [x] `dependency-cruiser.cjs` — no-circular + no-orphans + not-to-dev-dep (concrete per-package layer rules **have since landed** as the packagization completed: no-app/no-electron + presentational-leaf rules — see `dependency-cruiser.cjs`)
- [x] `electron.vite.config.ts` (main/preload/renderer 3 targets; preload forced **CJS `index.js`** for sandbox) — `apps/desktop` builds green
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

- [x] single `createWindow()` factory (contextIsolation/sandbox/nodeIntegration:false/webSecurity:true) + `setWindowOpenHandler` deny + `will-navigate` deny + permission deny-by-default (`src/main/{window,security}.ts`)
- [ ] Electron fuses (runAsNode=false, onlyLoadAppFromAsar, asar integrity, cookie encryption) — packaging step (with electron-builder)
- [x] power-monitor suspend/resume hooks (Recovery Coordinator hook point, Phase 1b) + per-profile partition (`persist:tepegoz-app`) — _`--use-system-ca`: deferred (verify correct Electron/Node mechanism); Electron fuses → packaging step_
- [x] preload: typed `contextBridge` (`window.tepegoz`); NO raw `ipcRenderer`; `src/shared/ipc-contract.ts` channel registry; main validates sender allow-list + output schema (`src/main/ipc.ts`)

### persistence + Event Journal (L1)

- [x] `packages/persistence` — better-sqlite3 (WAL, `synchronous=NORMAL`, foreign_keys ON)
- [x] append-only `events` table + `EventJournal` (append/read-from-lsn, monotonic lsn, `deviceId`) — _reducer/projector fold → Phase 1b_
- [x] content-addressed blob store (SHA-256, dedupe); **base64 never in journal** — only `cas://<hash>` refs — _WebP encoding at screenshot time, Phase 1b_
- [x] migration infra (PRAGMA user_version, txn, forward-only) + **day-0 sync-meta** (`updated_at`/`version`/`tombstone` on `kv`; `device_id` on events) + device-scope — _`version` now; `vector_clock` when CRDT lands (Phase 3)_
- [x] integration test harness (better-sqlite3, `:memory:`) — 5 tests green (journal + blob)

### native & workers (skeleton)

- [x] `packages/native-rs` (napi-rs) placeholder (Cargo.toml + lib.rs + README; **no package.json** → not in JS build/CI yet) — **egress in TS for MVP**
- [x] `src/main/workers/pool.ts` utilityProcess skeleton (`WorkerPool.initDeferred`, lazy after ready-to-show) — real workers Phase 1b

### CI/CD

- [x] `.github/workflows/ci.yml` — push/PR: frozen-lockfile install → turbo typecheck/lint/test/build + `pnpm audit` (report) + **AI-trailer commit-policy job**
- [ ] coverage gate (S80/B70/F80/L80) + reject focused/skipped tests — _deferred: enforce thresholds once substantive logic lands (Phase 1a)_
- [x] `.github/workflows/release.yml` — tag-driven **per-OS matrix** (fail-fast:false), native rebuild per-OS; packaging/signing step = TODO (see below)
- [ ] Start Windows code-signing identity (Azure Trusted Signing / EV) — _**deferred to the production gate**, permanently, per the ship line. Distribution concern, not a build concern; revisit only when a real release is cut. Everything below that depends on a certificate (update **signature verification**) is deferred with it and may not be claimed until then._

### Release & update hardening (pre-distribution; runtime flow activated before first public release)

> Anchored to the `electron-updater` config (build section above) + code-signing (below). Design lands in
> Phase 0; the live update/rollback runtime is gated to the first public release. The AIs' "P0 release
> blockers" — the boring-but-mandatory distribution infra — live here.

- [ ] **Auto-update runtime** (`electron-updater`) with **update-signature verification** (only signed builds
      from the trusted channel install) + **staged rollout / rollback** (a bad version auto-reverts to the
      last-known-good)
- [ ] **`crashReporter`** wiring + minidump collection — **opt-in**, redacted (reuse `Logger.redact`); no PII
      in reports
- [ ] **Safe-mode boot** (launch with extensions + agent disabled for recovery) + **corrupt-profile recovery**
      (migration-repair / fail-safe fresh-start — generalizes the existing `SessionStore` fail-safe: malformed
      snapshot → start fresh, never crash-loop)
- [ ] **Chromium security-update cadence** (upstream-intake side of the update story): pinned+watched
      `electron`, ≤2-week adoption SLA for security bumps, embedded engine version logged per release — see
      [ADR-0019](../../docs/adr/0019-chromium-update-cadence.md). This governs _which engine_ we ship; the
      auto-update runtime above governs _how_ we ship it.

### Documentation & security

- [x] root `README.md` (pre-existing, kept) + per-package READMEs (shared-types, libs, i18n, persistence, desktop)
- [x] `docs/adr/` **10 ADRs (0001–0010)** at Phase 0 _(now **0001–0016**; 0012–0016 added as later phases/refactors landed — browser-tab-model, agent-orchestration, user-data layout, package-extraction roadmap, per-package i18n — see `docs/adr/README.md`)_ + index: Electron+React+TS · monorepo · SQLite · event-sourced Journal · provider-agnostic AI · Policy Kernel+HITL · capability-plane/MCP(client+server) · perception/CDP · boundary-mapping · TS/tooling conventions
- [x] `CHANGELOG.md` (Keep-a-Changelog) + `docs/known-issues.md` + `handover/` skeleton
- [x] `.env.example` (key names only, no values; explicit "BYO keys live in OS keychain, not here")
- [x] **Threat Model Lite + Risk Register** (`docs/THREAT-MODEL.md`; High/Critical; assets/actors/entry-points/trust-boundaries/top-threats→mitigations/residual-risk)

### i18n infrastructure (DAY-0 — set up early to avoid pain later)

> **Mechanism refactored ([ADR-0016](../../docs/adr/0016-per-package-i18n.md)):** the monolithic `Resources`
> catalog below became **per-package dictionaries + a React runtime**. `@tepegoz/i18n` keeps only the shared
> core (`common`/`window`/`errors`) + `defineDict`/`pick`/`./react` (`useT`/`I18nProvider`)/`./testing`; each
> package/extension owns `src/i18n/{en,tr,index}.ts`; React surfaces `useT(dict)`, the main process uses
> `pick`/`mainStrings`. The en/tr-parity, no-hardcoded and main-process-i18n **outcomes** below still hold —
> now enforced **per dict**.

- [ ] choose + set up i18n library (chose a lightweight type-safe runtime: `defineDict` + `useT`/`I18nProvider`, not i18next; Electron renderer, no SSR) — **[ADR-0016](../../docs/adr/0016-per-package-i18n.md)**
- [x] `packages/i18n` locale bundle: `src/locales/en.ts` (**primary/source; fallback**) + `tr.ts` (full parity, first-class); namespaced (common, commandPalette, agentConsole, onboarding, errors) + `resolveLocale()`
- [x] type-safe keys: `Resources = typeof en` contract → any missing/mismatched key in `tr` is a **build error** (verified)
- [x] **"no hardcoded user-facing string" ESLint rule** — `eslint-plugin-i18next/no-literal-string` (`6.1.5`) on React surfaces (`**/*.tsx`) in **`jsx-text-only`** mode (flags visible JSX text, not className/aria/code strings) + allow-list (`**/i18n/**`, `**/locales/**`, `*.messages.ts`, `messages.ts`, tests). Repo scanned clean (1 pre-existing decorative `✕` glyph → JS-expression constant with a comment); every visible string comes from a dict via `useT`.
- [x] locale-aware formatting (date/number/plural/relative-time) + RTL-ready skeleton — `@tepegoz/i18n`: Intl wrappers `formatDate/Time/Number/Currency/RelativeTime/List` + `pluralCategory`/`selectPlural` (CLDR); `localeDir()`/`RTL_LOCALES`/`ALL_SUPPORTED_LTR` direction skeleton wired to `<html dir>` in the renderer (both shipping locales LTR; a first RTL locale is a one-line change). 13 tests.
- [ ] main-process user-facing text (native menu, dialog, notification, tray) reads from i18n — React-free, via `pick(dict, mainLocale())` → `mainStrings()` over the app's own dicts (ADR-0016)
- [ ] language selection: OS language default + override in settings; runtime language switch (no restart)
- [x] Turkish IME/keyboard pipeline skeleton (ç/ğ/ı/ö/ş/ü, Turkish-Q/F, dead keys) — `@tepegoz/i18n/turkish`: locale-correct `turkishUpper/Lower/Compare` (fixes the dotted/dotless `i↔İ`, `ı↔I` that JS defaults get wrong) + `TURKISH_SPECIAL_LETTERS` + `IME_MATRIX` (Q/F × 7 letters + dead-key cases) as structured data. **regression matrix EXECUTED (Playwright keystroke sim) in Phase 1a** — skeleton = data + case-folding here.

### Test infrastructure

- [x] Vitest (unit/integration) setup + sample tests (7 tests green across shared-types + libs)
- [x] Playwright `_electron` E2E smoke (Spectron forbidden) — launches built app, asserts "Tepegöz" + preload bridge; `pnpm e2e` green _(CI e2e + xvfb = follow-up)_
- [x] i18n integrity test: `en` and `tr` key sets equal + `resolveLocale` fallback (3 tests green)
