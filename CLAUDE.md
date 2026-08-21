# CLAUDE.md — working agreement for this repo

Guidance for Claude Code (and humans) working on **tepegoz-browser**.

## What this is

An agentic, security-by-design, local-first browser (Electron + TypeScript). Architecture and the
task-by-task roadmap live in **[`phases/`](phases/)** and **[`docs/adr/`](docs/adr/)**. The full plan
is `docs/ARCHITECTURE.md` — a thin index of the L0–L10 layer model pointing at the document that owns
each piece. Read `phases/README.md` first.

## Binding design rules

This project **must** comply with `//wsl.localhost/Ubuntu/home/kuray/internal-ai-rules`. Cross-cutting
gates are summarized in `phases/README.md`; ADR-0010 records deviations.

## Session close-out (standing rule)

**Every working session that touches a phase MUST end with the Phase Status Report** — what closed, and
how much is left. Format and the rules that keep it honest: [`phases/README.md`](phases/README.md#session-close-out--the-phase-status-report-standing-rule).

The short version: landed code is **not** a closed phase (✅ needs DoD passed _and_ the delta in the
results ledger); "how many left" counts against ✅, never against "started"; a session that closed
nothing prints **"hiçbiri"**; and blockers are named by **kind** (API spend ≠ downloaded weights ≠ rival
subscriptions).

> This lives in `CLAUDE.md` rather than only in agent memory on purpose: memory is keyed per machine and
> per absolute path, so the same repo opened from WSL, another checkout, or another machine is a
> different key and would silently lose the rule. `CLAUDE.md` travels with the code, so the rule applies
> from Windows, WSL, and CI alike.

## Git (non-negotiable)

- **Branch-based:** `<type>/<short-scope>` → self-review PR → `main`. Only trivial+reversible changes
  go straight to `main`.
- **origin is SSH** (`git@github.com:...`), never HTTPS.
- **No AI attribution trailers** in commit messages or PR bodies (`Co-Authored-By: Claude`,
  `Generated with Claude Code` are forbidden — enforced by the CI `commit-policy` job).

## Engineering conventions

- Strict TypeScript (no `@ts-ignore`); **zod `safeParse` at every trust boundary** (IPC, LLM tool-call
  args, MCP, adapters, journal, policy). `@tepegoz/shared-types` is the only schema source.
- `AppError(message, statusCode)` — services throw, the boundary maps (ADR-0009).
- Secrets only in the main process via `safeStorage`; never in env/bundle/logs (redaction).
- Every user-facing string is localized (English-first; Turkish first-class) — no hardcoded UI strings.
  Each package/extension **owns its dictionary** (`src/i18n/`, `defineDict` + `useT`); only the shared core
  (`common`/`window`/`errors`) lives in `@tepegoz/i18n` (ADR-0016).
- Renderer is untrusted; one secure `createWindow()` factory; typed `contextBridge` only.

## Commands

```sh
pnpm install                       # frozen in CI
pnpm dev                           # launch the Electron GUI (clears ELECTRON_RUN_AS_NODE)
pnpm exec turbo run typecheck lint test build
pnpm e2e                           # Playwright _electron smoke
pnpm test:electron                 # native-dependent (better-sqlite3) tests under Electron's Node
```

> **`better-sqlite3` ABI note.** One `.node` file matches one ABI. A fresh `pnpm install` fetches the
> **Node** prebuild (ABI 127 for Node 22); running the GUI needs the **Electron** ABI
> (`pnpm --filter @tepegoz/desktop rebuild` — ABI 148 for Electron 43). You cannot have both at once.
>
> better-sqlite3 publishes **no Electron prebuilds at any version**, so the Electron-ABI build always
> compiles from source and therefore needs a C++ toolchain (MSVC Build Tools on Windows). Without one you
> can still develop, test and launch the app — the DB degrades with a logged
> "Database unavailable … history/journal disabled" — but you cannot run `pnpm e2e` locally. CI has the
> toolchain on both runners.
>
> The SQLite-backed suites therefore **skip, with a reason**, when the addon does not match the current
> runtime — they used to hard-fail, which left `pnpm exec turbo run typecheck lint test` permanently red
> on any machine that had launched the app, with 63 failures explained away in prose. A suite that is
> always red stops being read.
>
> A skip is not a pass, so it is gated: `TEPEGOZ_REQUIRE_NATIVE=1` turns the skip back into a hard
> failure, and **both CI and `pnpm test:electron` set it**. The tests must actually run somewhere; those
> are the places. See `packages/persistence/src/native-abi.ts`.

## Layout

`apps/desktop` (L0 Electron) · `packages/{shared-types,libs,i18n,persistence}` · `packages/native-rs`
(Rust placeholder) · `docs/` (ADRs, threat model) · `phases/` (roadmap — `product/` · `ai-agent-super/`
· `tracks/`) · `e2e/` (Playwright).
